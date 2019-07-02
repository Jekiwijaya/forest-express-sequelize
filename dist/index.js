var _ = require('lodash');

var P = require('bluebird');

var Interface = require('forest-express');

var orm = require('./utils/orm');

var lianaPackage = require('../package.json');

var SchemaAdapter = require('./adapters/sequelize');

var ResourcesGetter = require('./services/resources-getter');

var ResourceGetter = require('./services/resource-getter');

var ResourceCreator = require('./services/resource-creator');

var ResourceUpdater = require('./services/resource-updater');

var ResourceRemover = require('./services/resource-remover');

var RecordsExporter = require('./services/records-exporter');

var HasManyGetter = require('./services/has-many-getter');

var HasManyAssociator = require('./services/has-many-associator');

var HasManyDissociator = require('./services/has-many-dissociator');

var BelongsToUpdater = require('./services/belongs-to-updater');

var ValueStatGetter = require('./services/value-stat-getter');

var PieStatGetter = require('./services/pie-stat-getter');

var LineStatGetter = require('./services/line-stat-getter');

var LeaderboardStatGetter = require('./services/leaderboard-stat-getter');

var QueryStatGetter = require('./services/query-stat-getter');

var RecordsDecorator = require('./utils/records-decorator');

var REGEX_VERSION = /(\d+\.)?(\d+\.)?(\*|\d+)/;
exports.collection = Interface.collection;
exports.ensureAuthenticated = Interface.ensureAuthenticated;
exports.StatSerializer = Interface.StatSerializer;
exports.ResourceSerializer = Interface.ResourceSerializer;
exports.ResourceDeserializer = Interface.ResourceDeserializer;
exports.Schemas = Interface.Schemas;
exports.ResourcesRoute = Interface.ResourcesRoute;

exports.init = function init(opts) {
  exports.opts = opts; // NOTICE: Ensure compatibility with the old middleware configuration.

  if (opts.sequelize && !('connections' in opts)) {
    opts.connections = [opts.sequelize];
    opts.sequelize = opts.sequelize.Sequelize;
  }

  exports.getLianaName = function getLianaName() {
    return 'forest-express-sequelize';
  };

  exports.getLianaVersion = function getLianaVersion() {
    var lianaVersion = lianaPackage.version.match(REGEX_VERSION);

    if (lianaVersion && lianaVersion[0]) {
      return lianaVersion[0];
    }

    return null;
  };

  exports.getOrmVersion = function getOrmVersion() {
    if (!opts.sequelize) {
      return null;
    }

    return orm.getVersion(opts.sequelize);
  };

  exports.getDatabaseType = function getDatabaseType() {
    if (!opts.connections) {
      return null;
    }

    return opts.connections[0].options.dialect;
  };

  exports.SchemaAdapter = SchemaAdapter;

  exports.getModels = function getModels() {
    // NOTICE: The default Forest configuration detects all models.
    var detectAllModels = _.isEmpty(opts.includedModels) && _.isEmpty(opts.excludedModels);

    var models = {};

    _.each(opts.connections, function (connection) {
      _.each(connection.models, function (model) {
        if (detectAllModels) {
          models[model.name] = model;
        } else if (!_.isEmpty(opts.includedModels) && _.includes(opts.includedModels, model.name)) {
          models[model.name] = model;
        } else if (!_.isEmpty(opts.excludedModels) && !_.includes(opts.excludedModels, model.name)) {
          models[model.name] = model;
        }
      });
    });

    return models;
  };

  exports.getModelName = function getModelName(model) {
    return model.name;
  }; // TODO: Remove nameOld attribute once the lianas versions older than 2.0.0 are minority


  exports.getModelNameOld = exports.getModelName;
  exports.ResourcesGetter = ResourcesGetter;
  exports.ResourceGetter = ResourceGetter;
  exports.ResourceCreator = ResourceCreator;
  exports.ResourceUpdater = ResourceUpdater;
  exports.ResourceRemover = ResourceRemover;
  exports.RecordsExporter = RecordsExporter;
  exports.HasManyGetter = HasManyGetter;
  exports.HasManyAssociator = HasManyAssociator;
  exports.HasManyDissociator = HasManyDissociator;
  exports.BelongsToUpdater = BelongsToUpdater;
  exports.ValueStatGetter = ValueStatGetter;
  exports.PieStatGetter = PieStatGetter;
  exports.LineStatGetter = LineStatGetter;
  exports.LeaderboardStatGetter = LeaderboardStatGetter;
  exports.QueryStatGetter = QueryStatGetter;
  exports.RecordsDecorator = RecordsDecorator;
  exports.Stripe = {
    getCustomer: function getCustomer(customerModel, customerField, customerId) {
      if (customerId) {
        return orm.findRecord(customerModel, customerId).then(function (customer) {
          if (customer && customer[customerField]) {
            return customer.toJSON();
          }

          return P.reject();
        });
      }

      return P.resolve();
    },
    getCustomerByUserField: function getCustomerByUserField(customerModel, customerField, userField) {
      if (!customerModel) {
        return new P(function (resolve) {
          return resolve();
        });
      }

      var query = {};
      query[customerField] = userField;
      return customerModel.findOne({
        where: query
      }).then(function (customer) {
        if (!customer) {
          return null;
        }

        return customer.toJSON();
      });
    }
  };
  exports.Intercom = {
    getCustomer: function getCustomer(userModel, customerId) {
      return orm.findRecord(userModel, customerId);
    }
  };
  exports.Closeio = {
    getCustomer: function getCustomer(userModel, customerId) {
      return orm.findRecord(userModel, customerId);
    }
  };
  exports.Layer = {
    getUser: function getUser(customerModel, customerField, customerId) {
      return new P(function (resolve, reject) {
        if (customerId) {
          return orm.findRecord(customerModel, customerId).then(function (customer) {
            if (!customer || !customer[customerField]) {
              return reject();
            }

            return resolve(customer);
          });
        }

        return resolve();
      });
    }
  };
  exports.Mixpanel = {
    getUser: function getUser(userModel, userId) {
      if (userId) {
        return orm.findRecord(userModel, userId).then(function (user) {
          return user.toJSON();
        });
      }

      return P.resolve();
    }
  };
  return Interface.init(exports);
};