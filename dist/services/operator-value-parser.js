"use strict";

var _interopRequireDefault = require("babel-runtime/helpers/interopRequireDefault");

var _lodash = _interopRequireDefault(require("lodash"));

var _forestExpress = require("forest-express");

var _operators = _interopRequireDefault(require("../utils/operators"));

var _operatorDateIntervalParser = _interopRequireDefault(require("./operator-date-interval-parser"));

function OperatorValueParser(options) {
  var OPERATORS = new _operators.default(options);

  this.perform = function (model, fieldName, value, timezone) {
    var operatorDateIntervalParser = new _operatorDateIntervalParser.default(value, timezone, options); // NOTICE: Handle boolean for MySQL database

    var modelName;
    var field;
    var fieldSplit;
    var valueBoolean;
    var fieldBoolean = false;

    if (fieldName.indexOf(':') === -1) {
      modelName = model.name;
    } else {
      fieldSplit = fieldName.split(':');
      modelName = fieldSplit[0];
      fieldName = fieldSplit[1];
    }

    var schema = _forestExpress.Schemas.schemas[modelName];

    if (schema) {
      field = _lodash.default.find(schema.fields, function (currentField) {
        return currentField.field === fieldName;
      });

      if (field && field.type === 'Boolean') {
        fieldBoolean = true;

        if (value.indexOf('true') > -1) {
          valueBoolean = true;
        } else if (value.indexOf('false') > -1) {
          valueBoolean = false;
        }
      }
    }

    var condition = {};

    if (value[0] === '!' && value[1] !== '*') {
      value = value.substring(1);

      if (fieldBoolean) {
        condition[OPERATORS.NOT] = _lodash.default.isUndefined(valueBoolean) ? null : valueBoolean;
      } else {
        condition[OPERATORS.NE] = value;
      }
    } else if (value[0] === '>') {
      condition[OPERATORS.GT] = value.substring(1);
    } else if (value[0] === '<') {
      condition[OPERATORS.LT] = value.substring(1);
    } else if (value[0] === '*' && value[value.length - 1] === '*') {
      condition[OPERATORS.LIKE] = "%".concat(value.substring(1, value.length - 1), "%");
    } else if (value[0] === '!' && value[1] === '*' && value[value.length - 1] === '*') {
      // TODO : Include null values
      // return { $or: { $notLike: '%' + value + '%', $eq: null } };
      condition[OPERATORS.NOT_LIKE] = "%".concat(value.substring(2, value.length - 1), "%");
    } else if (value[0] === '*') {
      condition[OPERATORS.LIKE] = "%".concat(value.substring(1));
    } else if (value[value.length - 1] === '*') {
      condition[OPERATORS.LIKE] = "".concat(value.substring(0, value.length - 1), "%");
    } else if (value === '$present') {
      condition[OPERATORS.NE] = null;
    } else if (value === '$blank') {
      condition[OPERATORS.EQ] = null;
    } else if (operatorDateIntervalParser.isIntervalDateValue()) {
      return operatorDateIntervalParser.getIntervalDateFilter();
    } else if (fieldBoolean) {
      condition[OPERATORS.EQ] = _lodash.default.isUndefined(valueBoolean) ? null : valueBoolean;
    } else {
      condition[OPERATORS.EQ] = value;
    }

    return condition;
  };
}

module.exports = OperatorValueParser;