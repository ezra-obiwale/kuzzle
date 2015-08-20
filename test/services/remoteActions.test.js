var
  should = require('should'),
  captainsLog = require('captains-log'),
  Kuzzle = require('root-require')('lib/api/Kuzzle');

describe('Testing: Remote Actions service', function () {
  var
    kuzzle;

  before(function (done) {
    kuzzle = new Kuzzle();
    kuzzle.log = new captainsLog({level: 'silent'});
    kuzzle.start({}, {dummy: true})
      .then(function () {
        done();
      });
  });

  it('should have init function', function () {
    should(kuzzle.services.list.remoteActions.init).be.Function();
  });

});
