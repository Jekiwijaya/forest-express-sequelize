"use strict";

var _interopRequireDefault = require("babel-runtime/helpers/interopRequireDefault");

var _lodash = _interopRequireDefault(require("lodash"));

var _forestExpress = require("forest-express");

var _operators = _interopRequireDefault(require("../utils/operators"));

var _baseStatGetter = _interopRequireDefault(require("./base-stat-getter"));

var _operatorDateIntervalParser = _interopRequireDefault(require("./operator-date-interval-parser"));

// jshint sub: true
function ValueStatGetter(model, params, options) {
  var _this = this;

  _baseStatGetter.default.call(this, model, params, options);

  var OPERATORS = new _operators.default(options);
  var schema = _forestExpress.Schemas.schemas[model.name];

  function getAggregate() {
    return params.aggregate.toLowerCase();
  }

  function getAggregateField() {
    // NOTICE: As MySQL cannot support COUNT(table_name.*) syntax, fieldName
    //         cannot be '*'.
    var fieldName = params.aggregate_field || schema.primaryKeys[0] || schema.fields[0].field;
    return "".concat(schema.name, ".").concat(fieldName);
  }

  function getIncludes() {
    var includes = [];

    _lodash.default.values(model.associations).forEach(function (association) {
      if (['HasOne', 'BelongsTo'].indexOf(association.associationType) > -1) {
        includes.push({
          model: association.target.unscoped(),
          as: association.associationAccessor,
          attributes: []
        });
      }
    });

    return includes;
  }

  function getIntervalDateFilterForPrevious() {
    var intervalDateFilter;
    params.filters.forEach(function (filter) {
      var operatorValueParser = new _operatorDateIntervalParser.default(filter.value, params.timezone, options);

      if (operatorValueParser.hasPreviousInterval()) {
        intervalDateFilter = filter;
      }
    });
    return intervalDateFilter;
  }

  this.perform = function () {
    var countCurrent;
    var aggregateField = getAggregateField();
    var aggregate = getAggregate();

    var filters = _this.getFilters();

    var filterDateIntervalForPrevious = getIntervalDateFilterForPrevious();
    return model.unscoped().aggregate(aggregateField, aggregate, {
      include: getIncludes(),
      where: filters
    }).then(function (count) {
      countCurrent = count || 0; // NOTICE: Search for previous interval value only if the filterType is
      //         'AND', it would not be pertinent for a 'OR' filterType.

      if (filterDateIntervalForPrevious && params.filterType === 'and') {
        var operatorValueParser = new _operatorDateIntervalParser.default(filterDateIntervalForPrevious.value, params.timezone, options);
        var conditions = filters[OPERATORS.AND];
        conditions.forEach(function (condition) {
          if (condition[filterDateIntervalForPrevious.field]) {
            condition[filterDateIntervalForPrevious.field] = operatorValueParser.getIntervalDateFilterForPreviousInterval();
          }
        });
        return model.unscoped().aggregate(aggregateField, aggregate, {
          include: getIncludes(),
          where: filters
        }).then(function (currentCount) {
          return currentCount || 0;
        });
      }

      return undefined;
    }).then(function (countPrevious) {
      return {
        value: {
          countCurrent: countCurrent,
          countPrevious: countPrevious
        }
      };
    });
  };
}

module.exports = ValueStatGetter;