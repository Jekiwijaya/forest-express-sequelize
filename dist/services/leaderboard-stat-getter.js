"use strict";

var _interopRequireDefault = require("babel-runtime/helpers/interopRequireDefault");

var _lodash = _interopRequireDefault(require("lodash"));

var _forestExpress = require("forest-express");

var _baseStatGetter = _interopRequireDefault(require("./base-stat-getter"));

function LeaderboardStatGetter(model, modelRelationship, params, options) {
  _baseStatGetter.default.call(this, model, params, options);

  var labelField = params.label_field;
  var aggregate = params.aggregate.toUpperCase();
  var aggregateField = params.aggregate_field;
  var limit = params.limit;
  var schema = _forestExpress.Schemas.schemas[model.name];
  var schemaRelationship = _forestExpress.Schemas.schemas[modelRelationship.name];
  var associationAs = schema.name;

  _lodash.default.each(modelRelationship.associations, function (association) {
    if (association.target.name === model.name && association.as) {
      associationAs = association.as;
    }
  });

  var groupBy = "".concat(associationAs, ".").concat(labelField);

  function getAggregateField() {
    // NOTICE: As MySQL cannot support COUNT(table_name.*) syntax, fieldName cannot be '*'.
    var fieldName = aggregateField || schemaRelationship.primaryKeys[0] || schemaRelationship.fields[0].field;
    return "".concat(schemaRelationship.name, ".").concat(fieldName);
  }

  this.perform = function () {
    return modelRelationship.unscoped().findAll({
      attributes: [[options.sequelize.fn(aggregate, options.sequelize.col(getAggregateField())), 'value']],
      include: [{
        model: model,
        attributes: [labelField],
        as: associationAs,
        required: true
      }],
      group: groupBy,
      order: [[options.sequelize.literal('value'), 'DESC']],
      limit: limit,
      raw: true
    }).then(function (records) {
      records = records.map(function (data) {
        data.key = data[groupBy];
        delete data[groupBy];
        return data;
      });
      return {
        value: records
      };
    });
  };
}

module.exports = LeaderboardStatGetter;