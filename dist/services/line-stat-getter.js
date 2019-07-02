"use strict";

var _interopRequireDefault = require("babel-runtime/helpers/interopRequireDefault");

var _lodash = _interopRequireDefault(require("lodash"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _moment = _interopRequireDefault(require("moment"));

var _forestExpress = require("forest-express");

var _baseStatGetter = _interopRequireDefault(require("./base-stat-getter"));

var _database = require("../utils/database");

// jshint sub: true
function LineStatGetter(model, params, options) {
  var _this = this;

  _baseStatGetter.default.call(this, model, params, options);

  var schema = _forestExpress.Schemas.schemas[model.name];
  var timeRange = params.time_range.toLowerCase();

  function getAggregateField() {
    // NOTICE: As MySQL cannot support COUNT(table_name.*) syntax, fieldName
    //         cannot be '*'.
    var fieldName = params.aggregate_field || schema.primaryKeys[0] || schema.fields[0].field;
    var schemaField = schema.fields.find(function (schemaField) {
      return schemaField.field === fieldName;
    });
    var columnName = schemaField ? schemaField.columnName : fieldName;
    return "".concat(schema.name, ".").concat(columnName);
  }

  function getGroupByDateField() {
    var fieldName = params.group_by_date_field;
    var schemaField = schema.fields.find(function (schemaField) {
      return schemaField.field === fieldName;
    });
    var columnName = schemaField ? schemaField.columnName : fieldName;
    return "".concat(schema.name, ".").concat(columnName);
  }

  var groupByDateField = getGroupByDateField();

  function getGroupByDateFieldFormatedForMySQL(currentTimeRange) {
    var groupByDateFieldFormated = "`".concat(groupByDateField.replace('.', '`.`'), "`");

    switch (currentTimeRange) {
      case 'day':
        return options.sequelize.fn('DATE_FORMAT', options.sequelize.col(groupByDateField), '%Y-%m-%d 00:00:00');

      case 'week':
        return options.sequelize.literal("DATE_FORMAT(DATE_SUB(".concat(groupByDateFieldFormated, ", INTERVAL ((7 + WEEKDAY(").concat(groupByDateFieldFormated, ")) % 7) DAY), '%Y-%m-%d 00:00:00')"));

      case 'month':
        return options.sequelize.fn('DATE_FORMAT', options.sequelize.col(groupByDateField), '%Y-%m-01 00:00:00');

      case 'year':
        return options.sequelize.fn('DATE_FORMAT', options.sequelize.col(groupByDateField), '%Y-01-01 00:00:00');

      default:
        return null;
    }
  }

  function getGroupByDateFieldFormatedForMSSQL(currentTimeRange) {
    var groupByDateFieldFormated = "[".concat(groupByDateField.replace('.', '].['), "]");

    switch (currentTimeRange) {
      case 'day':
        return options.sequelize.fn('FORMAT', options.sequelize.col(groupByDateField), 'yyyy-MM-dd 00:00:00');

      case 'week':
        return options.sequelize.literal("FORMAT(DATEADD(DAY, -DATEPART(dw,".concat(groupByDateFieldFormated, "),").concat(groupByDateFieldFormated, "), 'yyyy-MM-dd 00:00:00')"));

      case 'month':
        return options.sequelize.fn('FORMAT', options.sequelize.col(groupByDateField), 'yyyy-MM-01 00:00:00');

      case 'year':
        return options.sequelize.fn('FORMAT', options.sequelize.col(groupByDateField), 'yyyy-01-01 00:00:00');

      default:
        return null;
    }
  }

  function getGroupByDateFieldFormatedForSQLite(currentTimeRange) {
    switch (currentTimeRange) {
      case 'day':
        {
          return options.sequelize.fn('STRFTIME', '%Y-%m-%d', options.sequelize.col(groupByDateField));
        }

      case 'week':
        {
          return options.sequelize.fn('STRFTIME', '%Y-%W', options.sequelize.col(groupByDateField));
        }

      case 'month':
        {
          return options.sequelize.fn('STRFTIME', '%Y-%m-01', options.sequelize.col(groupByDateField));
        }

      case 'year':
        {
          return options.sequelize.fn('STRFTIME', '%Y-01-01', options.sequelize.col(groupByDateField));
        }

      default:
        return null;
    }
  }

  function getGroupByDateInterval() {
    if ((0, _database.isMySQL)(options)) {
      return [getGroupByDateFieldFormatedForMySQL(timeRange), 'date'];
    } else if ((0, _database.isMSSQL)(options)) {
      return [getGroupByDateFieldFormatedForMSSQL(timeRange), 'date'];
    } else if ((0, _database.isSQLite)(options)) {
      return [getGroupByDateFieldFormatedForSQLite(timeRange), 'date'];
    }

    return [options.sequelize.fn('to_char', options.sequelize.fn('date_trunc', params.time_range, options.sequelize.literal("\"".concat(getGroupByDateField().replace('.', '"."'), "\" at time zone '").concat(params.timezone, "'"))), 'YYYY-MM-DD 00:00:00'), 'date'];
  }

  function getFormat() {
    switch (timeRange) {
      case 'day':
        return 'DD/MM/YYYY';

      case 'week':
        return '[W]w-YYYY';

      case 'month':
        return 'MMM YY';

      case 'year':
        return 'YYYY';

      default:
        return null;
    }
  }

  function fillEmptyDateInterval(records) {
    if (records.length) {
      var sqlFormat = 'YYYY-MM-DD 00:00:00';

      if ((0, _database.isSQLite)(options) && timeRange === 'week') {
        sqlFormat = 'YYYY-WW';
      }

      var firstDate = (0, _moment.default)(records[0].label, sqlFormat);
      var lastDate = (0, _moment.default)(records[records.length - 1].label, sqlFormat);

      for (var i = firstDate; i.toDate() <= lastDate.toDate(); i = i.add(1, timeRange)) {
        var label = i.format(sqlFormat);

        if (!_lodash.default.find(records, {
          label: label
        })) {
          records.push({
            label: label,
            values: {
              value: 0
            }
          });
        }
      }

      records = _lodash.default.sortBy(records, 'label');
      return _lodash.default.map(records, function (record) {
        return {
          label: (0, _moment.default)(record.label, sqlFormat).format(getFormat()),
          values: record.values
        };
      });
    }

    return records;
  }

  function getAggregate() {
    return [options.sequelize.fn(params.aggregate.toLowerCase(), options.sequelize.col(getAggregateField())), 'value'];
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

  function getGroupBy() {
    return (0, _database.isMSSQL)(options) ? [getGroupByDateFieldFormatedForMSSQL(timeRange)] : [options.sequelize.literal('1')];
  }

  function getOrder() {
    return (0, _database.isMSSQL)(options) ? [getGroupByDateFieldFormatedForMSSQL(timeRange)] : [options.sequelize.literal('1')];
  }

  this.perform = function () {
    return model.unscoped().findAll({
      attributes: [getGroupByDateInterval(), getAggregate()],
      include: getIncludes(),
      where: _this.getFilters(),
      group: getGroupBy(),
      order: getOrder(),
      raw: true
    }).then(function (records) {
      return _bluebird.default.map(records, function (record) {
        return {
          label: record.date,
          values: {
            value: parseInt(record.value, 10)
          }
        };
      });
    }).then(function (records) {
      return {
        value: fillEmptyDateInterval(records)
      };
    });
  };
}

module.exports = LineStatGetter;