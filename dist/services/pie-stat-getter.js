"use strict";

var _interopRequireDefault = require("babel-runtime/helpers/interopRequireDefault");

var _lodash = _interopRequireDefault(require("lodash"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _moment = _interopRequireDefault(require("moment"));

var _forestExpress = require("forest-express");

var _orm = require("../utils/orm");

var _baseStatGetter = _interopRequireDefault(require("./base-stat-getter"));

var _database = require("../utils/database");

// NOTICE: These aliases are not camelcased to prevent issues with Sequelize.
var ALIAS_GROUP_BY = 'forest_alias_groupby';
var ALIAS_AGGREGATE = 'forest_alias_aggregate';

function PieStatGetter(model, params, options) {
  var _this = this;

  _baseStatGetter.default.call(this, model, params, options);

  var needsDateOnlyFormating = (0, _orm.isVersionLessThan4)(options.sequelize);
  var schema = _forestExpress.Schemas.schemas[model.name];
  var associationSplit;
  var associationCollection;
  var associationField;
  var associationSchema;
  var field;

  if (params.group_by_field.indexOf(':') === -1) {
    field = _lodash.default.find(schema.fields, function (currentField) {
      return currentField.field === params.group_by_field;
    });
  } else {
    associationSplit = params.group_by_field.split(':');
    associationCollection = associationSplit[0];
    associationField = associationSplit[1];
    associationSchema = _forestExpress.Schemas.schemas[associationCollection];
    field = _lodash.default.find(associationSchema.fields, function (currentField) {
      return currentField.field === associationField;
    });
  }

  function getGroupByField() {
    if (params.group_by_field.indexOf(':') === -1) {
      return "".concat(schema.name, ".").concat(params.group_by_field);
    }

    return params.group_by_field.replace(':', '.');
  }

  var groupByField = getGroupByField();

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

  function getGroupBy() {
    return (0, _database.isMSSQL)(options) ? [options.sequelize.col(groupByField)] : [ALIAS_GROUP_BY];
  }

  function formatResults(records) {
    return _bluebird.default.map(records, function (record) {
      var key;

      if (field.type === 'Date') {
        key = (0, _moment.default)(record[ALIAS_GROUP_BY]).format('DD/MM/YYYY HH:mm:ss');
      } else if (field.type === 'Dateonly' && needsDateOnlyFormating) {
        var offsetServer = (0, _moment.default)().utcOffset() / 60;

        var dateonly = _moment.default.utc(record[ALIAS_GROUP_BY]).add(offsetServer, 'h');

        key = dateonly.format('DD/MM/YYYY');
      } else {
        key = String(record[ALIAS_GROUP_BY]);
      }

      return {
        key: key,
        value: record[ALIAS_AGGREGATE]
      };
    });
  }

  this.perform = function () {
    return model.unscoped().findAll({
      attributes: [[options.sequelize.col(groupByField), ALIAS_GROUP_BY], [options.sequelize.fn(getAggregate(), options.sequelize.col(getAggregateField())), ALIAS_AGGREGATE]],
      include: getIncludes(),
      where: _this.getFilters(),
      group: getGroupBy(),
      order: [[options.sequelize.literal(ALIAS_AGGREGATE), 'DESC']],
      raw: true
    }).then(formatResults).then(function (records) {
      return {
        value: records
      };
    });
  };
}

module.exports = PieStatGetter;