var
  should = require('should'),
  winston = require('winston'),
  RequestObject = require.main.require('lib/api/core/models/requestObject'),
  RealTimeResponseObject = require.main.require('lib/api/core/models/realTimeResponseObject'),
  params = require('rc')('kuzzle'),
  Kuzzle = require.main.require('lib/api/Kuzzle'),
  Profile = require.main.require('lib/api/core/models/security/profile'),
  Role = require.main.require('lib/api/core/models/security/role');

require('should-promised');

describe('Test: hotelClerk.addSubscription', function () {
  var
    kuzzle,
    roomId,
    connection = {id: 'connectionid'},
    context = {
      connection: connection,
      user: null
    },
    roomName = 'roomName',
    collection = 'user',
    filter = {
      term: {
        firstName: 'Ada'
      }
    };

  beforeEach(function (done) {
    require.cache = {};
    kuzzle = new Kuzzle();
    kuzzle.log = new (winston.Logger)({transports: [new (winston.transports.Console)({level: 'silent'})]});
    kuzzle.removeAllListeners();

    return kuzzle.start(params, {dummy: true})
      .then(function () {
        kuzzle.repositories.role.roles.guest = new Role();
        return kuzzle.repositories.role.hydrate(kuzzle.repositories.role.roles.guest, params.userRoles.guest);
      })
      .then(function () {
        kuzzle.repositories.profile.profiles.anonymous = new Profile();
        return kuzzle.repositories.profile.hydrate(kuzzle.repositories.profile.profiles.anonymous, params.userProfiles.anonymous);
      })
      .then(function () {
        return kuzzle.repositories.user.anonymous();
      })
      .then(function (user) {
        context.user = user;
        done();
      });
  });

  it('should have object filtersTree, customers and rooms empty', function () {
    should(kuzzle.dsl.filtersTree).be.an.Object();
    should(kuzzle.dsl.filtersTree).be.empty();

    should(kuzzle.hotelClerk.rooms).be.an.Object();
    should(kuzzle.hotelClerk.rooms).be.empty();

    should(kuzzle.hotelClerk.customers).be.an.Object();
    should(kuzzle.hotelClerk.customers).be.empty();
  });

  it('should have the new room and customer', function () {
    var requestObject = new RequestObject({
      controller: 'subscribe',
      action: 'on',
      requestId: roomName,
      collection: collection,
      body: filter,
      metadata: {
        foo: 'bar',
        bar: [ 'foo', 'bar', 'baz', 'qux']
      }
    });

    return kuzzle.hotelClerk.addSubscription(requestObject, context)
      .then(function (realTimeResponseObject) {
        should(kuzzle.dsl.filtersTree).be.an.Object();
        should(kuzzle.dsl.filtersTree).not.be.empty();

        should(kuzzle.hotelClerk.rooms).be.an.Object();
        should(kuzzle.hotelClerk.rooms).not.be.empty();

        should(kuzzle.hotelClerk.customers).be.an.Object();
        should(kuzzle.hotelClerk.customers).not.be.empty();

        should(realTimeResponseObject).be.an.Object();
        should(realTimeResponseObject.roomId).be.a.String();
        should(kuzzle.hotelClerk.rooms[realTimeResponseObject.roomId]).be.an.Object();
        should(kuzzle.hotelClerk.rooms[realTimeResponseObject.roomId]).not.be.empty();

        roomId = kuzzle.hotelClerk.rooms[realTimeResponseObject.roomId].id;

        should(kuzzle.hotelClerk.customers[connection.id]).be.an.Object();
        should(kuzzle.hotelClerk.customers[connection.id]).not.be.empty();
        should(kuzzle.hotelClerk.customers[connection.id][roomId]).not.be.undefined().and.match(requestObject.metadata);
      });
  });

  it('should call a function join when the type is websocket', function () {
    var
      joinedRooms = [],
      requestObject = new RequestObject({
        controller: 'subscribe',
        collection: collection,
        body: filter
      });

    // mockup internal function kuzzle called when type is websocket
    connection.type = 'websocket';
    kuzzle.io = {
      sockets: {
        connected: {
          connectionid: {
            join: function (roomId) {
              joinedRooms.push(roomId);
            }
          }
        }
      }
    };
    kuzzle.notifier = {notify: function () {}};

    return kuzzle.hotelClerk.addSubscription(requestObject, context)
      .then(function () {
        should(joinedRooms).containEql(roomId);
        delete connection.type;
      });
  });

  it('should return the same response when the user has already subscribed to the filter', done => {
    var requestObject = new RequestObject({
      controller: 'subscribe',
      collection: collection,
      body: filter
    });
    var response;

    return kuzzle.hotelClerk.addSubscription(requestObject, context)
      .then(result => {
        response = result;
        return kuzzle.hotelClerk.addSubscription(requestObject, context);
      })
      .then(result => {
        should(result).match(response);
        done();
      });
  });

  it('should reject an error when a filter is unknown', function () {
    var
      pAddSubscription,
      requestObject = new RequestObject({
        controller: 'subscribe',
        action: 'on',
        collection: collection,
        body: {badterm : {firstName: 'Ada'}}
      });

    pAddSubscription = kuzzle.hotelClerk.addSubscription(requestObject, context);
    return should(pAddSubscription).be.rejected();
  });

  it('should return the same room ID if the same filters are used', done => {
    var
      requestObject1 = new RequestObject({
        controller: 'subscribe',
        collection: collection,
        body: {
          term: {
            firstName: 'Ada'
          },
          exists: {
            field: 'lastName'
          }
        }
      }),
      requestObject2 = new RequestObject({
        controller: 'subscribe',
        collection: collection,
        body: {
          exists: {
            field: 'lastName'
          },
          term: {
            firstName: 'Ada'
          }
        }
      }),
      response;

    return kuzzle.hotelClerk.addSubscription(requestObject1, context)
      .then(result => {
        response = result;
        return kuzzle.hotelClerk.addSubscription(requestObject2, context);
      })
      .then(result => {
        should(result.roomId).be.exactly(response.roomId);
        done();
      })
      .catch(error => {
        done(error);
      });
  });

  it('should allow subscribing with an empty filter', function () {
    var
      requestObject = new RequestObject({
        controller: 'subscribe',
        collection: collection
      });

    delete requestObject.data.body;
    
    return should(kuzzle.hotelClerk.addSubscription(requestObject, context)).be.fulfilled();
  });

  it('should delay a room creation if it has been marked for destruction', function (done) {
    var
      requestObject = new RequestObject({
        controller: 'subscribe',
        collection: collection
      });

    kuzzle.hotelClerk.addSubscription(requestObject, context)
      .then(response => {
        kuzzle.hotelClerk.rooms[response.roomId].destroyed = true;

        kuzzle.hotelClerk.addSubscription(requestObject, {connection: {id: 'anotherID'}, user: null})
          .then(recreated => {
            should(recreated.roomId).be.exactly(response.roomId);
            should(kuzzle.hotelClerk.rooms[recreated.roomId].destroyed).be.undefined();
            should(kuzzle.hotelClerk.rooms[recreated.roomId].customers.length).be.exactly(1);
            should(kuzzle.hotelClerk.rooms[recreated.roomId].customers).match(['anotherID']);
            done();
          })
          .catch(error => done(error));

        process.nextTick(() => delete kuzzle.hotelClerk.rooms[response.roomId]);
      })
      .catch(error => done(error));
  });

  it('should allow to subscribe to an existing room', done => {
    var
      roomId,
      requestObject1 = new RequestObject({
        controller: 'subscribe',
        collection: collection
      });

    kuzzle.hotelClerk.addSubscription(requestObject1, {connection: 'connection1', user: null})
      .then(result => {
        should(result).be.an.instanceOf(RealTimeResponseObject);
        should(result).have.property('roomId');

        return Promise.resolve(result.roomId);
      })
      .then(id => {
        var requestObject2 = new RequestObject({
          collection: collection,
          controller: 'subscribe',
          action: 'join',
          body: {
            roomId: id
          }
        });

        roomId = id;
        requestObject2.body = {roomId: roomId};
        return kuzzle.hotelClerk.join(requestObject2, {connection: 'connection2', user: null});
      })
      .then(result => {
        should(result).be.an.instanceOf(RealTimeResponseObject);
        should(result).have.property('roomId', roomId);
        done();
      })
      .catch(error => {
        done(error);
      });

  });
  
});
