'use strict';
var _ = require('lodash');
var P = require('bluebird');
var OperatorValueParser = require('./operator-value-parser');

// jshint sub: true
function PieStatGetter(model, params, opts) {
  var associatedField;
  var associatedValues;

  function detectGroupByAssociationField() {
    _.values(model.associations).forEach(function (association) {
      if (params['group_by_field'] === association.target.name) {
        associatedField = association.foreignKey;
      }
    });
  }

  function getAggregate() {
    return params.aggregate.toLowerCase();
  }

  function getAggregateField() {
    return params['aggregate_field'] || 'id';
  }

  function getFilters() {
    var filters = {};

    if (params.filters) {
      params.filters.forEach(function (filter) {
        filters[filter.field] = new OperatorValueParser(opts).perform(model,
          filter.field, filter.value);
      });
    }

    return filters;
  }

  function getGroupBy() {
    return associatedField || params['group_by_field'];
  }

  function retrieveAssociatedValuesIfAny (records) {
    if (!associatedField) { return records; }

    var associatedIds = _.map(records, getGroupBy());
    return model.associations[params['group_by_field']].target
      .findAll({ where: { id: { $in: associatedIds }}})
      .then(function (values) {
        associatedValues = _.map(values, 'dataValues');
      })
      .thenReturn(records);
  }

  function formatResults (records) {
    return P.map(records, function (record) {
      record = record.toJSON();
      var key;

      if (associatedValues) {
        key = _.find(associatedValues, function (value) {
          return value.id === record[getGroupBy()];
        });
      } else {
        key = String(record[getGroupBy()]);
      }

      return {
        key: key,
        value: record.value
      };
    });
  }

  this.perform = function () {
    detectGroupByAssociationField();

    return model.findAll({
      attributes: [
        getGroupBy(),
        [
          opts.sequelize.fn(getAggregate(),
          opts.sequelize.col(getAggregateField())),
          'value'
        ]
      ],
      where: getFilters(),
      group: [getGroupBy()],
      order: 'value DESC'
    })
    .then(retrieveAssociatedValuesIfAny)
    .then(formatResults)
    .then(function (records) {
      return { value: records };
    });
  };
}

module.exports = PieStatGetter;
