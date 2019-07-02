"use strict";

var _interopRequireDefault = require("babel-runtime/helpers/interopRequireDefault");

var _defineProperty2 = _interopRequireDefault(require("babel-runtime/helpers/defineProperty"));

var _lodash = _interopRequireDefault(require("lodash"));

var _bluebird = _interopRequireDefault(require("bluebird"));

var _forestExpress = require("forest-express");

var _operators = _interopRequireDefault(require("../utils/operators"));

var _operatorValueParser = _interopRequireDefault(require("./operator-value-parser"));

var _compositeKeysManager = _interopRequireDefault(require("./composite-keys-manager"));

var _queryBuilder = _interopRequireDefault(require("./query-builder"));

var _searchBuilder = _interopRequireDefault(require("./search-builder"));

var _liveQueryChecker = _interopRequireDefault(require("./live-query-checker"));

var _errors = require("./errors");

function ResourcesGetter(model, options, params) {
  var schema = _forestExpress.Schemas.schemas[model.name];
  var queryBuilder = new _queryBuilder.default(model, options, params);
  var segmentScope;
  var segmentWhere;
  var OPERATORS = new _operators.default(options);

  var primaryKey = _lodash.default.keys(model.primaryKeys)[0];

  function getFieldNamesRequested() {
    if (!params.fields || !params.fields[model.name]) {
      return null;
    } // NOTICE: Populate the necessary associations for filters


    var associationsForQuery = [];

    _lodash.default.each(params.filter, function (values, key) {
      if (key.indexOf(':') !== -1) {
        var association = key.split(':')[0];
        associationsForQuery.push(association);
      }
    });

    if (params.sort && params.sort.indexOf('.') !== -1) {
      associationsForQuery.push(params.sort.split('.')[0]);
    } // NOTICE: Force the primaryKey retrieval to store the records properly in the client.


    return _lodash.default.union([primaryKey], params.fields[model.name].split(','), associationsForQuery);
  }

  var fieldNamesRequested = getFieldNamesRequested();
  var searchBuilder = new _searchBuilder.default(model, options, params, fieldNamesRequested);
  var hasSmartFieldSearch = false;

  function handleFilterParams() {
    var where = {};
    var conditions = [];

    _lodash.default.each(params.filter, function (values, key) {
      if (key.indexOf(':') !== -1) {
        key = "$".concat(key.replace(':', '.'), "$");
      }

      values.split(',').forEach(function (value) {
        var condition = {};
        condition[key] = new _operatorValueParser.default(options).perform(model, key, value, params.timezone);
        conditions.push(condition);
      });
    });

    if (params.filterType) {
      where[OPERATORS[params.filterType.toUpperCase()]] = conditions;
    }

    return where;
  }

  function getWhere() {
    return new _bluebird.default(function (resolve, reject) {
      var where = {};
      where[OPERATORS.AND] = [];

      if (params.search) {
        where[OPERATORS.AND].push(searchBuilder.perform());
      }

      if (params.filter) {
        where[OPERATORS.AND].push(handleFilterParams());
      }

      if (segmentWhere) {
        where[OPERATORS.AND].push(segmentWhere);
      }

      if (params.segmentQuery) {
        var queryToFilterRecords = params.segmentQuery.trim();
        new _liveQueryChecker.default().perform(queryToFilterRecords); // WARNING: Choosing the first connection might generate issues if the model does not
        //          belongs to this database.

        return options.connections[0].query(queryToFilterRecords, {
          type: options.sequelize.QueryTypes.SELECT
        }).then(function (results) {
          var recordIds = results.map(function (result) {
            return result[primaryKey] || result.id;
          });
          var condition = (0, _defineProperty2.default)({}, primaryKey, {});
          condition[primaryKey][OPERATORS.IN] = recordIds;
          where[OPERATORS.AND].push(condition);
          return resolve(where);
        }, function (error) {
          var errorMessage = "Invalid SQL query for this Live Query segment:\n".concat(error.message);

          _forestExpress.logger.error(errorMessage);

          reject(new _errors.ErrorHTTP422(errorMessage));
        });
      }

      return resolve(where);
    });
  }

  function getRecords() {
    var scope = segmentScope ? model.scope(segmentScope) : model.unscoped();
    var include = queryBuilder.getIncludes(model, fieldNamesRequested);
    return getWhere().then(function (where) {
      var findAllOpts = {
        where: where,
        include: include,
        order: queryBuilder.getOrder(),
        offset: queryBuilder.getSkip(),
        limit: queryBuilder.getLimit()
      };

      if (params.search) {
        _lodash.default.each(schema.fields, function (field) {
          if (field.search) {
            try {
              field.search(findAllOpts, params.search);
              hasSmartFieldSearch = true;
            } catch (error) {
              _forestExpress.logger.error("Cannot search properly on Smart Field ".concat(field.field), error);
            }
          }
        });

        var fieldsSearched = searchBuilder.getFieldsSearched();

        if (fieldsSearched.length === 0 && !hasSmartFieldSearch) {
          if (!params.searchExtended || !searchBuilder.hasExtendedSearchConditions()) {
            // NOTICE: No search condition has been set for the current search, no record can be
            //         found.
            return [];
          }
        }
      }

      return scope.findAll(findAllOpts);
    });
  }

  function countRecords() {
    var scope = segmentScope ? model.scope(segmentScope) : model.unscoped();
    var include = queryBuilder.getIncludes(model, fieldNamesRequested);
    return getWhere().then(function (where) {
      var countOptions = {
        include: include,
        where: where
      };

      if (!primaryKey) {
        // NOTICE: If no primary key is found, use * as a fallback for Sequelize.
        countOptions.col = '*';
      }

      if (params.search) {
        _lodash.default.each(schema.fields, function (field) {
          if (field.search) {
            try {
              field.search(countOptions, params.search);
              hasSmartFieldSearch = true;
            } catch (error) {
              _forestExpress.logger.error("Cannot search properly on Smart Field ".concat(field.field), error);
            }
          }
        });

        var fieldsSearched = searchBuilder.getFieldsSearched();

        if (fieldsSearched.length === 0 && !hasSmartFieldSearch) {
          if (!params.searchExtended || !searchBuilder.hasExtendedSearchConditions()) {
            // NOTICE: No search condition has been set for the current search, no record can be
            //         found.
            return 0;
          }
        }
      }

      return scope.count(countOptions);
    });
  }

  function getSegment() {
    if (schema.segments && params.segment) {
      var segment = _lodash.default.find(schema.segments, function (schemaSegment) {
        return schemaSegment.name === params.segment;
      });

      segmentScope = segment.scope;
      segmentWhere = segment.where;
    }
  }

  function getSegmentCondition() {
    getSegment();

    if (_lodash.default.isFunction(segmentWhere)) {
      return segmentWhere(params).then(function (where) {
        segmentWhere = where;
      });
    }

    return _bluebird.default.resolve();
  }

  this.perform = function () {
    return getSegmentCondition().then(getRecords).then(function (records) {
      var fieldsSearched = null;

      if (params.search) {
        fieldsSearched = searchBuilder.getFieldsSearched();
      }

      if (schema.isCompositePrimary) {
        records.forEach(function (record) {
          record.forestCompositePrimary = new _compositeKeysManager.default(model, schema, record).createCompositePrimary();
        });
      }

      return [records, fieldsSearched];
    });
  };

  this.count = function () {
    return getSegmentCondition().then(countRecords);
  };
}

module.exports = ResourcesGetter;