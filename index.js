'use strict';

var t = require('tcomb');
var fcomb = require('fcomb');
var util = require('./util');

var Str = t.Str;
var Num = t.Num;
var Bool = t.Bool;
var Obj = t.Obj;
var Arr = t.Arr;
var Any = t.Any;
var subtype = t.subtype;
var enums = t.enums;
var list = t.list;

var SchemaType = enums.of('null string number integer boolean object array', 'SchemaType');

// fcomb extensions

fcomb.uniqueItems = function uniqueItems() {
  var ret = function uniqueItems(x) {
    return x.every( function (val, key) {
      return x.slice(key+1).every(function (val2, key2) {
        return val2 !== val;
      });
    });
  };
  ret.fmeta = {
    kind: 'uniqueItems'
  };
  return ret;
}

function and(f, g) {
  return f ? fcomb.and(f, g) : g;
}

function enumNameMap(s) {
  t.assert(s.enum.length === s.enumNames.length, 'enumNames %s and enum %s of unequal length', s.enumNames, s.enum);
  var map = {};
  s.enum.forEach(function (val, key) {
    map[val] = s.enumNames[key];
  }); 
  return enums(map);
}

var types = {

  string: function (s) {
    if (s.hasOwnProperty('enum')) {
      
      // return key-title map if enumNames are present (must be of identical length to enum)
      if (s.hasOwnProperty('enumNames')) {
        return enumNameMap(s);
      }

      return enums.of(s['enum']);
    }
    var predicate;
    if (s.hasOwnProperty('minLength')) {
      predicate = and(predicate, fcomb.minLength(s.minLength));
    }
    if (s.hasOwnProperty('maxLength')) {
      predicate = and(predicate, fcomb.maxLength(s.maxLength));
    }
    if (s.hasOwnProperty('pattern')) {
      predicate = and(predicate, fcomb.regexp(new RegExp(s.pattern)));
    }
    if (s.hasOwnProperty('format')) {
      t.assert(formats.hasOwnProperty(s.format), 'missing format %s, use the `registerFormat` API', s.format);
      predicate = and(predicate, formats[s.format]);
    }
    return predicate ? subtype(Str, predicate) : Str;
  },

  number: function (s) {
    if (s.hasOwnProperty('enum')) {
      
      // return key-title map if enumNames are present (must be of identical length to enum)
      if (s.hasOwnProperty('enumNames')) {
        return enumNameMap(s);
      }

      return enums.of(s['enum']);
    }
    var predicate;
    if (s.hasOwnProperty('minimum')) {
      predicate = s.exclusiveMinimum ?
        and(predicate, fcomb.gt(s.minimum)) :
        and(predicate, fcomb.gte(s.minimum));
    }
    if (s.hasOwnProperty('maximum')) {
      predicate = s.exclusiveMaximum ?
        and(predicate, fcomb.lt(s.maximum)) :
        and(predicate, fcomb.lte(s.maximum));
    }
    if (s.hasOwnProperty('integer') && s.integer) {
      predicate = and(predicate, util.isInteger);
    }
    return predicate ? subtype(Num, predicate) : Num;
  },

  integer: function (s) {
    if (s.hasOwnProperty('enum')) {
      
      // return key-title map if enumNames are present (must be of identical length to enum)
      if (s.hasOwnProperty('enumNames')) {
        return enumNameMap(s);
      }
      
      return enums.of(s['enum']);
    }
    var predicate;
    if (s.hasOwnProperty('minimum')) {
      predicate = s.exclusiveMinimum ?
        and(predicate, fcomb.gt(s.minimum)) :
        and(predicate, fcomb.gte(s.minimum));
    }
    if (s.hasOwnProperty('maximum')) {
      predicate = s.exclusiveMaximum ?
        and(predicate, fcomb.lt(s.maximum)) :
        and(predicate, fcomb.lte(s.maximum));
    }
    return predicate ? subtype(util.Int, predicate) : util.Int;
  },

  boolean: function (s) {
    return Bool;
  },

  object: function (s) {
    var props = {};
    var hasProperties = false;
    var required = {};
    if (s.required) {
      s.required.forEach(function (k) {
        required[k] = true;
      });
    }
    for (var k in s.properties) {
      if (s.properties.hasOwnProperty(k)) {
        hasProperties = true;
        var type = transform(s.properties[k]);
        props[k] = required[k] || type === Bool ? type : t.maybe(type);
      }
    }
    return hasProperties ? t.struct(props, s.description) : Obj;
  },

  array: function (s) {
    var predicate;
    var type = Arr;

    if (s.hasOwnProperty('items')) {
      var items = s.items;
      if (Obj.is(items)) {
        type = t.list(transform(s.items));
      } else {
        type = t.tuple(items.map(transform));
      }
    }
  
    if (s.hasOwnProperty('minItems')) {
      predicate = and(predicate, fcomb.minLength(s.minItems));
    }
    if (s.hasOwnProperty('maxItems')) {
      predicate = and(predicate, fcomb.maxLength(s.maxItems));
    }
    if (s.hasOwnProperty('uniqueItems') && s.uniqueItems) {
      predicate = and(predicate, fcomb.uniqueItems()); 
    }
    return predicate ? subtype(type, predicate) : type;
  },

  null: function () {
    return util.Null;
  }

};

function transform(s) {
  t.assert(Obj.is(s));
  if (!s.hasOwnProperty('type')) {
    return t.Any;
  }
  var type = s.type;
  if (SchemaType.is(type)) {
    return types[type](s);
  }
  if (Arr.is(type)) {
    return t.union(type.map(function (type) {
      return types[type](s);
    }));
  }
  t.fail(t.format('unsupported json schema %j', s));
}

var formats = {};

transform.registerFormat = function registerFormat(format, predicate) {
  t.assert(!formats.hasOwnProperty(format), '[tcomb-json-schema] duplicated format %s', format);
  formats[format] = predicate;
};

transform.resetFormats = function resetFormats() {
  formats = {};
};

module.exports = transform;
