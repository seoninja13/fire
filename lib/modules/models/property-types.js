'use strict';

var Table = require('./table');
var inflection = require('inflection');
var utils = require('./../../helpers/utils');
var Property = require('./property');
var Q = require('q');
var crypto = require('crypto');
var Model = require('./model');

function toModelName(modelNameOrModel) {
	var modelName = '';
	if(typeof modelNameOrModel == 'string') {
		modelName = modelNameOrModel;
	}
	else {
		modelName = modelNameOrModel.getName();
	}
	return modelName;
}

function _propertyType(propertyTypeName, propertyTypeMethod, args) {
	if(typeof propertyTypeName != 'string') {
		throw new Error('Wrap _propertyType() in property type is invalid.');
	}

	return function(property) {
		if(typeof property.signature != 'undefined') {
			if(!propertyTypeName.length) {
				throw new Error('Could not find property type method.');
			}

			if(!property.signature.filter(function(propertyType) {
				return (propertyType.name === propertyTypeName);
			}).length) {

				property.signature.push({
					name: propertyTypeName,
					params: (args || []).filter(function(arg) {
						return (typeof arg != 'undefined');
					})
				});
			}
		}

		return propertyTypeMethod.apply(this, [property]);
	};
}

/**
 * @constructor PropertyTypes
**/
var propertyTypes = {
	/**
	 * Sets the property's data type to `TEXT`. See {@link PropertyTypes#String} which is preferred as it's a less database-specific term.
	 *
	 * @name PropertyTypes#Text
	 * @function
	 */
	Text: function() {
		return Table.keywords.Text;
	},

	/**
	 * Sets the property's data type to `TEXT`.
	 *
	 * @name PropertyTypes#Text
	 * @function
	 */
	String: function() {
		return Table.keywords.Text;
	},

	/**
	 * Sets the property's data type to `INTEGER`.
	 *
	 * @name PropertyTypes#Number
	 * @function
	 */
	Number: function() {
		return Table.keywords.Integer;
	},

	/**
	 * Sets the property's data type to `SMALLINT`.
	 *
	 * @name PropertyTypes#SmallInt
	 * @function
	 */
	SmallInt: function() {
		return Table.keywords.SmallInt;
	},

	/**
	 * Sets the property's data type to `INTEGER`. This is a synonym of {@link PropertyTypes#Number}.
	 *
	 * @name PropertyTypes#Integer
	 * @function
	 */
	Integer: function() {
		return Table.keywords.Integer;
	},

	/**
	 * Sets the property's data type to `BIGINT`.
	 *
	 * @name PropertyTypes#BigInt
	 * @function
	 */
	BigInt: function() {
		return Table.keywords.BigInt;
	},

	/**
	 * Sets the property's data type to DECIMAL, see http://www.postgresql.org/docs/current/static/datatype-numeric.html.
	 *
	 * @param precision The precision of the number, must be positive.
	 * @param scale The scale of the number. 0 or positive.
	 *
	 * @name PropertyTypes#Decimal
	 * @function
	 */
	Decimal: function(precision, scale) {
		return _propertyType('Decimal', function() {
			return Table.keywords.Decimal(precision, scale);
		}, [precision, scale]);
	},

	/**
	 * Sets the property's data type to `BOOLEAN`.
	 *
	 * @name PropertyTypes#Boolean
	 * @function
	 */
	Boolean: function() {
		return Table.keywords.Boolean;
	},

	/**
	 * Sets the property's data type to `DATE`.
	 *
	 * This only stores the date. Use {@link PropertyTypes#DateTime} if you want to include time as well.
	 *
	 * @name PropertyTypes#Date
	 * @function
	 */
	Date: function() {
		return function(property) {
			property.options.isDate = true;
			return Table.keywords.Date;
		};
	},

	/**
	 * Sets the property's data type to `TIMESTAMP WITHOUT TIME ZONE`.
	 *
	 * @name PropertyTypes#DateTime
	 * @function
	 */
	DateTime: function DateTime() {
		return function(property) {
			property.options.isDate = true;
			return Table.keywords.Timestamp;
		};
	},

	/**
	* Sets the property's data type to `TIMESTAMP WITHOUT TIME ZONE`.
	*
	* @name PropertyTypes#Timestamp
	* @function
	*/
	Timestamp: function() {
		return function(property) {
			property.options.isDate = true;
			return Table.keywords.Timestamp;
		};
	},

	/**
	 * Sets the property's data type to `TIME WITH TIME ZONE`.
	 *
	 * @name PropertyTypes#Time
	 * @function
	 */
	Time: function() {
		return Table.keywords.Time;
	},

	/**
	 * Sets the property's data type to `INTERVAL`.
	 *
	 * See {@link http://www.postgresql.org/docs/9.1/static/datatype-datetime.html}.
	 *
	 * @name PropertyTypes#Interval
	 * @function
	 */
	Interval: function() {
		return Table.keywords.Interval;
	},

	/**
	 * Sets the property to `UNSIGNED`. This can be used in combination with e.g. {@link PropertyTypes#Number}.
	 *
	 * @name PropertyTypes#Unsigned
	 * @function
	 */
	Unsigned: function() {
		return {
			clause: Table.keywords.Unsigned
		};
	},

	/**
	 * Sets the property's data type to `SERIAL`, see {@link http://www.postgresql.org/docs/9.3/static/datatype-numeric.html#DATATYPE-SERIAL}.
	 *
	 * @name PropertyTypes#Serial
	 * @function
	 */
	Serial: function() {
		return Table.keywords.Serial;
	},

	/**
	 * Defines the property as primary key on the model.
	 *
	 * @name PropertyTypes#PrimaryKey
	 * @function
	 */
	PrimaryKey: function() {
		return {
			clause: Table.keywords.PrimaryKey
		};
	},

	/**
	 * Defines the property as `UNIQUE`.
	 *
	 * @name PropertyTypes#Unique
	 * @function
	 */
	Unique: function() {
		return {
			clause: Table.keywords.Unique
		};
	},

	Optional: function() {
		return function(property) {
			property.options.isRequired = false;
		};
	},

	/**
	 * Sets the property as `NOT NULL`.
	 *
	 * @name PropertyTypes#Required
	 * @function
	 */
	Required: function() {
		return function(property) {
			property.options.isRequired = true;
		};
	},

	/**
	 * Creates a virtual SQL-ish property.
	 *
	 * This allows you to create a static value, or calculated value based on other properties, without actually storing it.
	 *
	 * `sqlish` should be an SQLish string, see {@link Table#parseSQLishStatement} for more information on SQLish.
	 *
	 * For example:
	 * ```
	 * function Book() {
	 * 	this.title = [this.String];
	 * 	this.titleLength = [this.SQL('LENGTH($title) * 2')];
	 * }
	 * ```
	 * This creates a book model with a `title` property and a `titleLength` property which returns the length of the title times two. This creates a query similar to `SELECT title, (LENGTH(title) * 2) as title_length FROM books` when querying for books.
	 *
	 * A more advanced example:
	 * ```
	 * function Article() {
	 * 	this.title 			= [this.String, this.Required];
	 *  this.url 			= [this.String, this.Required, this.CanUpdate(false), this.Unique];
	 *  this.createdAt 		= [this.DateTime, this.Default('CURRENT_TIMESTAMP')];
	 *  this.author 		= [this.BelongsTo(this.models.User, 'articles'), this.Automatic, this.Required, this.AutoFetch];
	 *  this.voters 		= [this.HasMany(this.models.User, 'votes'), this.AutoFetch];
	 *  this.position 		= [this.SQL('($count("voters") - 1) / ((EXTRACT(EPOCH FROM current_timestamp - $createdAt) / 3600) + 2)^1.8')];
	 * }
	 * app.model(Article);
	 * ```
	 *
	 * @param {String} sqlish SQLish statement.
	 * @name PropertyTypes#SQL
	 * @function
	 */
	SQL: function(sqlish) {
		return _propertyType('SQL', function(property) {
			property.options.isVirtual = true;
			property.options.sqlish = sqlish;
		}, [sqlish]);
	},

	Where: function(rawWhere) {
		return _propertyType('Where', function(property) {
			property.options.isVirtual = true;
			property.options.rawWhere = rawWhere;
		}, [rawWhere]);
	},

	/**
	 * Defines the property as `SERIAL PRIMARY KEY`.
	 *
	 * Please note that by default a `id` property is created on every model. The default data type is {@link PropertyTypes#UUID}.
	 *
	 * @name PropertyTypes#function
	 * @function
	 */
	Id: function() {
		return Table.keywords.Id;
	},

	/**
	 * Defines the property as `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`.
	 *
	 * UUID is the default data type for the automatic `id` property. UUID requires the `uuid-ossp` extension, see {@link Datastore#setup}.
	 */
	UUID: function() {
		return Table.keywords.UUID;
	},

	/**
	 * Defines the property as UUID only.
	 *
	 * This property type will be renamed to just "UUID", but currently the property type already exist.
	 */
	UUIDType: function() {
		return Table.keywords.UUIDType;
	},

	/**
	 * Sets the default value of the property.
	 *
	 * You can either provide a string which will be evaluated in the SQL statement, or provide a function, which will be invoked when a new model instance is created.
	 *
	 * The below example sets the `createdAt`'s default value to the current time stamp (via SQL statement).
	 * ```
	 * function Article() {
	 * 	this.createdAt = [this.DateTime, this.Default('CURRENT_TIMESTAMP')];
	 * }
	 * ```
	 *
	 * The below example also sets the `createdAt`'s default value to the current time stamp (via a function).
	 * ```
	 * function Article() {
	 * 	this.createdAt = [this.DateTime, this.Default(function() {
	 * 		return new Date();
	 * 	})];
	 * }
	 * ```
	 *
	 * Please note that you can even return a promise in the case of a function. The default value will become the value the promise resolves to.
	 *
	 * @param {String|Function} defaultValue The default value, either an SQL string or a function returning a value.
	 * @param {String} changePropertyName Re-set the default value when this property name gets updated.
	 *
	 * @name PropertyTypes#Default
	 * @function
	 */
	Default: function(defaultValue, changePropertyName) {
		return _propertyType('Default', function(property) {
			if(typeof defaultValue == 'function') {
				property.options.defaultValue = defaultValue;
				property.options.defaultChangePropertyName = changePropertyName;
			}
			else {
				return {
					clause: Table.keywords.Default(defaultValue)
				};
			}
		}, [defaultValue, changePropertyName]);
	},

	/**
	 * Hashes a property's value before it's inserted in the database or it's searched for in a where map, see {@link Model#find}.
	 *
	 * This is especially useful if you, for example, want to hash a user's password before it's inserted into the database. For example:
	 * ```
	 * var crypto = require('crypto');
	 *
	 * function User() {
	 * 	this.email = [this.String];
	 * 	this.password = [this.String, this.Required, this.Hash(function(password) {
	 * 		var hash = crypto.createHash('sha512');
	 * 		hash.update(password);
	 * 		return hash.digest('hex');
	 * 	})];
	 * }
	 * app.model(User);
	 * ```
	 *
	 * This also hashes any values in the where map, for example, if you would query for the user:
	 * ```
	 * this.models.User.findOne({
	 * 	email: 'martijn@nodeonfire.org',
	 * 	password: 'test'
	 * });
	 * ```
	 * This automatically hashes `"test"` as well.
	 *
	 * Please note, if you want to implement authentication, you are advised to use {@link PropertyTypes#Authenticate} instead.
	 *
	 * @param {Function} method A function taking 1 argument returning it's hash.
	 * @name PropertyTypes#Hash
	 * @function
	 */
	Hash: function(method) {
		return _propertyType('Hash', function(property) {
			var hashMethod = property.model.models.app.injector.prepare(method);
			property.options.hashMethod = hashMethod;
		}, [method]);
	},

	Search: function() {
		return function(property) {
			property.options.isSearch = true;
			property.options.isReserved = true;
			property.options.isHidden = true;
			return Table.keywords.TSVector;
		};
	},

	/**
	 * Set this on an association to automatically fetch all instances when a model instance is retrieved.
	 *
	 * If an association is auto-fetched, it's directly available as property on the model instance.
	 *
	 * @name PropertyTypes#AutoFetch
	 * @function
	 */
	AutoFetch: function(autoFetchProperties) {
		return _propertyType('AutoFetch', function(property) {
			property.options.autoFetch = true;
			if(Array.isArray(autoFetchProperties)) {
				property.options.autoFetchProperties = autoFetchProperties;
				if(property.options.autoFetchProperties.indexOf('id') == -1) {
					property.options.autoFetchProperties.push('id');
				}
			}
		}, [autoFetchProperties]);
	},

	/**
	 * Sets a property as virtual. Virtual properties are not stored in the database.
	 *
	 * @param {Boolean} value True if virtual, false if not. Defaults to true.
	 * @name PropertyTypes#Virtual
	 * @function
	 */
	Virtual: function(value) {
		return _propertyType('Virtual', function(property) {
			property.options.isVirtual = value || true;
		}, [value]);
	},

	/**
	 * Creates a transform property. A transform property is one or more virtual properties and combined into one property.
	 *
	 * ```
	 * function Shoe() {
	 * 	this.three = [this.Transform(one, two) {
	 * 		return (one * two);
	 * 	}];
	 * }
	 * app.model(Shoe);
	 *
	 * //
	 *
	 * models.Shoe.create({
	 * 		one: 3,
	 * 		two: 6
	 *  })
	 * 	.then(function(shoe) {
	 * 		// shoe.three is 18
	 *  });
	 * ```
	 *
	 * The transform method is not invoked if any of the transform parameters is undefined. For example, the below example doesn't set `three`.
	 * ```
	 * models.Shoe.create({
	 * 	one: 3
	 * })
	 * .then(function(shoe) {
	 * 	// shoe.three is not set via the transform method (thus it's the default value)
	 * })
	 * ```
	 *
	 * @param {Function} method The transform method. The property's created are based on this method's arguments.
	 *
	 * @name PropertyTypes#Transform
	 * @function
	 */
	Transform: function(method) {
		return _propertyType('Transform', function(property) {
			property.options.transformMethod = method;

			var transformMethodArgumentNames = utils.getMethodArgumentNames(method);
			var model = property.model;

			transformMethodArgumentNames.forEach(function(key) {
				if(!model.models.app.injector.exists(key) && !model[key]) {
					model.addProperty(new Property(key, [model.Virtual], model, model.models));
				}
			});
		}, [method]);
	},

	/**
	 * Creates a virtual property which allows you to transform the where clause.
	 *
	 * For example, you can create a `popular` select property and when querying popular articles, only return the articles with more than ten comments.
	 *
	 * ```
	 * function Article() {
	 * 	this.title = [this.String];
	 * 	this.numberOfComments = [this.Integer];
	 * 	this.popular = [this.Select(function(popular) {
	 * 		if(popular) {
	 * 			return {
	 * 				numberOfComments: {
	 * 					$gt: 10
	 * 				};
	 * 			};
	 * 		}
	 * 	});
	 * }
	 * app.model(Article);
	 *
	 * //
	 *
	 * models.Article.find({popular: true})
	 * 	.then(function(popularArticles) {
	 * 		// Do something with the popular articles.
	 * 	});
	 * ```
	 *
	 * @param {Function} method The select method.
	 *
	 * @name PropertyTypes#Select
	 * @function
	 */
	Select: function(method) {
		return _propertyType('Select', function(property) {
			property.options.selectMethod = method;
			property.options.isVirtual = true;
		}, [method]);
	},

	/**
	 * This property type is part of the association methods. Use this model in a one-to-one or one-to-many association.
	 *
	 * The below example shows how to configure a one-to-one association:
	 * ```
	 * function User() {
	 * 	this.name = [this.String];
	 * 	this.address = [this.HasOne(this.models.UserAddress)]
	 * }
	 * app.model(User);
	 *
	 * function UserAddress() {
	 * 	this.user = [this.BelongsTo(this.models.User)];
	 * 	this.line1 = [this.String];
	 * 	this.line2 = [this.String];
	 * }
	 * app.model(UserAddress);
	 * ```
	 *
	 *
	 * @param {Model|String} modelNameOrModel   The associated model.
	 * @param {String} linkedPropertyName If multiple associations on the target model to this model exists,
	 *
	 * @name PropertyTypes#BelongsTo
	 * @function
	 */
	BelongsTo: function(modelNameOrModel, options) {
		if(modelNameOrModel) {
			return _propertyType('BelongsTo', function(property) {
				property.columnName 			= property.columnName + '_id';
				property.options.referenceName 	= toModelName(modelNameOrModel);
				property.options.belongsTo 		= true;
				property.options.canUpdate 		= false;
				property.options.isRequired 	= true;

				var linkedPropertyName;
				if(options) {
					if(typeof options == 'string') {
						linkedPropertyName = options;
					}
					else {
						linkedPropertyName = options.linkedPropertyName;

						if(options.through) {
							throw new Error('You cannot specify a through model in BelongsTo. To create a many-to-many association, please use HasMany-HasMany.');
						}
					}
				}

				if(linkedPropertyName) {
					property.options.linkedPropertyName = linkedPropertyName;
				}

				var associatedModel = property.getAssociatedModel();
				if(associatedModel) {
					// Now, find any associations which reference this model
					var associations = associatedModel.findAssociationsTo(property.model, linkedPropertyName);

					if(associations.length > 1) {
						throw new Error('Multiple associations to `' + property.model.getName() + '` exists on `' + associatedModel.getName() + '`.');
					}
					else if(associations.length == 1) {
						var associatedProperty = associations[0];

						property.options.belongsTo = associatedProperty.name;

						if(associatedProperty.options.hasMany) {
							associatedProperty.options.hasMany = property.name;
						}
						else if(associatedProperty.options.hasOne) {
							associatedProperty.options.hasOne = property.name;
						}
						else {
							//
						}

						associatedProperty.options.relationshipVia = property;
						property.options.relationshipVia = associatedProperty;
					}
				}

				if(associatedModel) {
					return {
						index: 999,
						clause: Table.keywords.References(associatedModel.getTableName()),
						dataType: 'UUID'
					};
				}
				else {
					return {
						index: 999,
						clause: Table.keywords.References(inflection.tableize(property.options.referenceName)),
						dataType: 'UUID'
					};
				}
			}, [modelNameOrModel, options]);
		}

		return null;
	},

	Has: function() {
		return function() {
			throw new Error('PropertyTypes#Has is deprecated.');
		};
	},

	HasMany: function(modelNameOrModel, options) {
		// `modelNameOrModel` may be falsy. Likely during a soft migration. Do not throw an error here.
		if(modelNameOrModel) {
			return _propertyType('HasMany', function(property) {
				// Set reference to the current model
				property.options.referenceName 	= toModelName(modelNameOrModel);

				var linkedPropertyName = null;
				var throughModel = null;

				if(options) {
					if(typeof options == 'string') {
						linkedPropertyName = options;
					}
					else if(typeof options == 'object') {
						linkedPropertyName = options.linkedPropertyName;
						throughModel = options.through;
					}
				}

				if(linkedPropertyName) {
					property.options.linkedPropertyName = linkedPropertyName;
				}

				// Now let's check if this is a many-to-many reference
				var associatedModel = property.getAssociatedModel();
				var associatedProperty = null;

				if(associatedModel) {
					// Now, find any associations which reference this model
					var associations = associatedModel.findAssociationsTo(property.model, linkedPropertyName);

					if(associations.length > 1) {
						throw new Error('Multiple associations to `' + property.model.getName() + '` exists on `' + associatedModel.getName() + '`.');
					}
					else if(associations.length == 1) {
						associatedProperty = associations[0];

						// TODO: should we set name, or something else?
						property.options.hasMany = associatedProperty.name;
					}
					else {
						// Could not find an association
						// ... this could be part of a one-to-many association
						// so let's just set:
						property.options.hasMany = inflection.camelize(property.model.getName(), true);
					}

					if(associatedProperty) {
						if(associatedProperty.options.hasMany) {
							// Now we link many-to-many associatedModel and property.model
							// We sort the names, to make sure we always generate the same table.
							if(!throughModel) {
								if(!associatedModel.models.isSoftMigrating()) {
									var propertyNames = [
										inflection.camelize(property.model.getName()) + utils.ucfirst(inflection.singularize(property.name)),
										inflection.camelize(associatedModel.getName()) + utils.ucfirst(inflection.singularize(associatedProperty.name))
									];

									var names = [propertyNames[0], propertyNames[1]];
									names.sort();
									var name = names[0] + names[1];

									throw new Error('In a many-to-many association, please specify the through model manually. In a previous version `' + name + '` would be created automatically.');
								}
								else {
									// During soft migrations, some models may not be available yet.
								}
							}
							else {
								if(typeof throughModel == 'string') {
									throw new Error('Please specify a model as through model `' + throughModel + '` in many-to-many instead of a string.');
								}

								/*
								if(typeof throughModel.isPrivate == 'undefined') {
									throughModel.isPrivate = true;
								}
								*/

								throughModel.options.isThroughModel = true;

								throughModel.options.throughProperty = property;
								throughModel.options.throughAssociatedProperty = associatedProperty;

								// .. and let's also set the options.hasMany thingy correctly on both properties
								associatedProperty.options.hasMany = property.name;
								property.options.hasMany = associatedProperty.name;

								// Through is the model which connects the two relationships
								associatedProperty.options.through = throughModel;
								property.options.through = throughModel;

								throughModel.models.postInstallModel(throughModel);
							}
						}
						else if(associatedProperty.options.belongsTo) {
							associatedProperty.options.belongsTo = property.name;

							// TODO: Set the columnName?
						}
						else {
							// ... any other cases we need to cover?
						}

						// RelationshipVia is the property of the other model
						associatedProperty.options.relationshipVia 	= property;
						property.options.relationshipVia 			= associatedProperty;
					}
				}
				else {
					// Couldn't find the associated model yet, so we can't know the right property
					property.options.hasMany = true;
				}
			}, [modelNameOrModel, options]);
		}

		return null;
	},

	HasOne: function(modelNameOrModel, linkedPropertyName) {
		if(modelNameOrModel) {
			return _propertyType('HasOne', function(property) {
				property.options.referenceName 	= toModelName(modelNameOrModel);
				property.options.hasOne 		= inflection.camelize(property.model.getName(), true);

				if(linkedPropertyName) {
					property.options.linkedPropertyName = linkedPropertyName;
				}

				var associatedModel = property.getAssociatedModel();
				if(associatedModel) {
					var associations = associatedModel.findAssociationsTo(property.model, linkedPropertyName);

					if(associations.length > 1) {
						throw new Error('Multiple associations to `' + property.model.getName() + '` exists on `' + associatedModel.getName() + '`.');
					}
					else if(associations.length == 1) {
						var associatedProperty = associations[0];

						// If this is a hasMany, let's set the correct name
						if(associatedProperty.options.hasMany) {
							associatedProperty.options.hasMany = property.name;
						}
						else if(associatedProperty.options.belongsTo) {
							associatedProperty.options.belongsTo = property.name;
							associatedProperty.columnName = associatedProperty.name + '_id';

							property.options.hasOne = inflection.camelize(associatedProperty.name, true);
						}
						else {
							// TODO: Anything we want to do here?
						}

						associatedProperty.options.relationshipVia = property;
						property.options.relationshipVia = associatedProperty;
					}
				}
			}, [modelNameOrModel, linkedPropertyName]);
		}

		return null;
	},

	/**
	 * Creates a counting property which counts the number of instances in an association.
	 *
	 * ```
	 * function Project() {
	 *	this.tasks = [this.HasMany(this.models.Task), this.AutoFetch];
	 *	this.numberOfTasks = [this.Count('tasks')];
	 *}
	 *app.model(Project);
	 * ```
	 *
	 * @param {String} propertyName The name of the property belonging to a one-to-many association.
	 *
	 * @name PropertyTypes#Count
	 * @function
	 */
	Count: function(propertyName) {
		return _propertyType('Count', function(property) {
			property.options.isVirtual = true;

			var targetProperty = property.model.getProperty(propertyName);
			if(!targetProperty) {
				throw new Error('Cannot find property with name `' + propertyName + '`.');
			}

			property.options.counting = propertyName;
		}, [propertyName]);
	},

	/**
	 * Creates an aggregate property.
	 *
	 * For example, the following model creates a minimum aggregate property type.
	 *
	 * ```
	 * function Tester() {
	 * 	this.name = [this.String];
	 * 	this.position = [this.Integer];
	 * 	this.minPosition = [this.Aggregate('MIN', 'position')];
	 * }
	 * app.model(Tester);
	 * ```
	 *
	 * When retrieving a model instance, the aggregate property is never selected automatically. To select the aggregate property specify the property name in the `select` option in {@link Model#find}.
	 *
	 * For example, the below piece fetches the `minPosition` property:
	 * ```
	 * function TestController(TesterModel) {
	 * 	TesterModel.find({}, {groupBy:'name', select: ['name', 'minPosition']});
	 * }
	 * ```
	 *
	 * This will return models instances grouped by name including a `minPosition` property.
	 *
	 * @param {String} aggregateFunctionName The name of the SQL aggregate function, for example, MIN.
	 * @param {String} propertyName      The target property name.
	 *
	 * @name PropertyTypes#Aggregate
	 * @function
	 */
	Aggregate: function(aggregateFunctionName, propertyName) {
		return _propertyType('Aggregate', function(property) {
			var targetProperty = property.model.getProperty(propertyName);
			if(!targetProperty) {
				throw new Error('Cannot find property with name `' + propertyName + '`.');
			}

			property.options.isVirtual = true;
			property.options.isAggregate = true;
			property.options.sqlish = aggregateFunctionName.toUpperCase() + '("' + targetProperty.model.getTableName() + '".' + targetProperty.columnName + ')';
		}, [aggregateFunctionName, propertyName]);
	},

	/**
	 * Sets a property to be the authenticating property and sets the model as the authenticator. Currently, there can only be one authenticator.
	 *
	 * The authenticator is used for authentication and is e.g. the User or Account model.
	 *
	 * To create an authenticator, see the below example:
	 * ```
	 * function User() {
	 * 	this.email = [this.String, this.Authenticate];
	 * }
	 * app.model(User);
	 * ```
	 *
	 * This creates an authenticator with `email` as the authenticating property. A `password` property is automatically created, and an `accessToken` property is also created which is used for session authentication. The authenticate property is automatically set to be unique.
	 *
	 * Several methods are created on an authenticator automatically: {@link Model#authorize}, {@link Model#getMe}, {@link Model#signOut}, {@link Model#resetPassword}, {@link Model#forgotPassword}.
	 *
	 * To sign in an authenticator, see {@link Model#authorize}.
	 *
	 * @name PropertyTypes#Authenticate
	 * @function
	 */
	Authenticate: function(excludePassword) {
		return _propertyType('Authenticate', function(property) {
			var model = property.model;

			model.options.authenticatingProperty = property;
			property.options.authenticate = true;
			model.options.isPasswordBased = (excludePassword !== true);
			property.options.canUpdate = false;
			property.options.isRequired = true;

			var migrate = function() {
				var createRandomTokenFunction = function(length) {
					return function() {
						var defer = Q.defer();
						crypto.randomBytes(length, function(error, buffer) {
							if(error) {
								defer.reject(error);
							}
							else {
								defer.resolve(buffer.toString('hex'));
							}
						});
						return defer.promise;
					};
				};

				if(model.options.isPasswordBased) {
					var resetPasswordModelName = model.getName() + 'ResetPassword';
					var resetPasswordModel = model.models.findModel(resetPasswordModelName);
					if(!model.models.isSoftMigrating()) {
						if(!resetPasswordModel) {
							resetPasswordModel = model.models.createModel(resetPasswordModelName, {
								authenticator: [model.BelongsTo(model.getName()), model.Required],
								token: [model.String, model.Default(createRandomTokenFunction(128)), model.Required]
							});
						}

						resetPasswordModel.isPrivate = true;
					}
					model.models.sharedModelNames.push(resetPasswordModelName);

					model.addProperty(new Property('passwordSalt', [model.String, model.Private, model.Default(createRandomTokenFunction(128), 'password'), model.CanUpdate(false)], model, model.models), true);

					model.addProperty(new Property('password', [model.String, model.Required, model.Private, model.Hash(function(password, passwordSalt) {
						if(password) {
							var hash = crypto.createHash('sha512');
							hash.update(password);

							if(passwordSalt) {
								hash.update(passwordSalt);
							}

							return hash.digest('hex');
						}
						else {
							throw new Error('No password provided');
						}
					})], model, model.models), true);
					model.addProperty(new Property('passwordReset', [model.HasOne(resetPasswordModel)], model, model.models), true);
				}

				model.addProperty(new Property('accessToken', [model.String, model.Default(createRandomTokenFunction(128)), model.CanUpdate(false)], model, model.models), true);

				var loginTokenModelName = model.getName() + 'LoginToken';
				var loginTokenModel = model.models.findModel(loginTokenModelName);
				if(!model.models.isSoftMigrating()) {
					if(!loginTokenModel) {
						loginTokenModel = model.models.createModel(loginTokenModelName, {
							authenticator: [model.BelongsTo(model.getName()), model.Required],
							token: [model.String, model.Unique, model.Default(createRandomTokenFunction(64)), model.Required, model.CanUpdate(false)],
							createdAt: [model.DateTime, model.Default('CURRENT_TIMESTAMP'), model.CanUpdate(false)]
						});
					}

					loginTokenModel.isPrivate = true;
				}
				model.models.sharedModelNames.push(loginTokenModelName);
			};

			if(!model.isShared() || model.models.app.settings('isMaster')) {
				if(!model.options.migrations) {
					model.options.migrations = [];
				}

				if(model.models.app.isRunStage() || model.models.app.isBuildStage()) {
					migrate();
				}
				else {
					model.options.migrations.push(migrate);
				}
			}
			else {
				if(model.models.app.isRunStage() || model.models.app.isBuildStage()) {
					migrate();
				}
				else {
					//
				}
			}

			return {
				clause: Table.keywords.Unique
			};
		}, [excludePassword]);
	},

	/**
	 * Creates a private property. A private property is guaranteed to never get send to the front-end directly (unless otherwise exposed). This is useful for sensitive for things like passwords.
	 *
	 * ```
	 * function Project() {
	 * 	this.name = [this.String];
	 * 	this.secret = [this.String, this.Private];
	 * }
	 * ```
	 *
	 * @name PropertyTypes#Private
	 * @function
	 */
	Private: function() {
		return function(property) {
			property.options.isPrivate = true;
		};
	},

	/**
	 * Sets the property to the current authenticator automatically. See {@link PropertyTypes#Authenticate}.
	 *
	 * @name PropertyTypes#Automatic
	 * @function
	 */
	Automatic: function() {
		return _propertyType('Automatic', function(property) {
			var model = property.model;

			property.options.isAutomatic = true;

			// Currently multiple automatic property names per model isn't possible.
			if(model.options.automaticPropertyName && model.options.automaticPropertyName != property.name) {
				throw new Error('Adding an automatic property on `' + model.getName() + '` but an automatic property already exists. Currently only one automatic property is supported.');
			}

			model.options.automaticPropertyName = property.name;

			// We'll disable manual updates to this property as this is probably not the intention.
			// In case updating should happen, simply set this.CanUpdate(true) on the property type (after this.Automatic).
			property.options.canUpdate = false;
		});
	},

	Create: function() {
		throw new Error('PropertyTypes#Create is deprecated. Use PropertyTypes#CanCreate instead.');
	},

	Read: function() {
		throw new Error('PropertyTypes#Create is deprecated. Use PropertyTypes#CanCreate instead.');
	},

	Update: function() {
		throw new Error('PropertyTypes#Create is deprecated. Use PropertyTypes#CanCreate instead.');
	},

	Delete: function() {
		throw new Error('PropertyTypes#Create is deprecated. Use PropertyTypes#CanCreate instead.');
	},

	CanCreate: function(propertyKeyPathOrFunction) {
		return _propertyType('CanCreate', function(property) {
			if(property.name == 'accessControl') {
				throw new Error('Property `accessControl` is deprecated. Please define an accessControl method instead.');
			}
			else {
				property.options.canCreate = propertyKeyPathOrFunction;
			}
		}, [propertyKeyPathOrFunction]);
	},

	CanRead: function(propertyKeyPathOrFunction) {
		return _propertyType('CanRead', function(property) {
			if(property.name == 'accessControl') {
				throw new Error('Property `accessControl` is deprecated. Please define an accessControl method instead.');
			}
			else {
				property.options.canRead = propertyKeyPathOrFunction;
			}
		}, [propertyKeyPathOrFunction]);
	},

	CanSet: function(canSet) {
		return _propertyType('CanSet', function(property) {
			property.options.canSet = canSet;
		}, [canSet]);
	},

	CanUpdate: function(propertyKeyPathOrFunction) {
		return _propertyType('CanUpdate', function(property) {
			if(property.name == 'accessControl') {
				throw new Error('Property `accessControl` is deprecated. Please define an accessControl method instead.');
			}
			else {
				property.options.canUpdate = propertyKeyPathOrFunction;
			}
		}, [propertyKeyPathOrFunction]);
	},

	CanDelete: function(propertyKeyPathOrFunction) {
		return _propertyType('CanDelete', function(property) {
			if(property.name == 'accessControl') {
				throw new Error('Property `accessControl` is deprecated. Please define an accessControl method instead.');
			}
			else {
				property.options.canDelete = propertyKeyPathOrFunction;
			}
		}, [propertyKeyPathOrFunction]);
	}
};

/**
* Sets the property to the current user (or authenticator) automatically.
*
* This is a synonym of {@link PropertyTypes#Automatic}.
*
* @name PropertyTypes#CurrentUser
*/
propertyTypes.CurrentUser = propertyTypes.Automatic;

/**
* Sets the property to the current account (or authenticator) automatically.
*
* This is a synonym of {@link PropertyTypes#Automatic}.
*
* @name PropertyTypes#CurrentAccount
*/
propertyTypes.CurrentAccount = propertyTypes.Automatic;

var _ = {};

Object.keys(propertyTypes).forEach(function(propertyTypeName) {
	var propertyType = propertyTypes[propertyTypeName];

	_[propertyTypeName] = function() {
		var args = [];
		for(var i = 0, il = arguments.length; i < il; i++) {
			args.push(arguments[i]);
		}

		if(typeof this.signature != 'undefined') {
			this.signature.push({
				name: propertyTypeName,
				params: args
			});
		}

		return propertyType.apply(this, args);
	};
});

exports = module.exports = _;
