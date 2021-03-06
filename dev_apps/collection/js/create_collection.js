'use strict';
/* global CategoryCollection */
/* global CollectionsDatabase */
/* global CollectionIcon */
/* global Promise */
/* global QueryCollection */
/* global Suggestions */

(function(exports) {

  var _ = navigator.mozL10n.get;
  var eme = exports.eme;

  function HandleCreate(activity) {

    var request;
    var loading = document.getElementById('loading');
    var cancel = document.getElementById('cancel');
    var maxIconSize = activity.source.data.maxIconSize;

    CollectionIcon.init(maxIconSize);
    var numAppIcons = CollectionIcon.numAppIcons;

    cancel.addEventListener('click', function() {
      // TODO request should always have an 'abort' method
      // but sometimes it doesn't. find out why!
      // "TypeError: request.abort is not a function"
      // {file: "app://collection.gaiamobile.org/js/activities.js" line: 20}
      request.abort && request.abort();
      activity.postResult(false);
    });

    request = eme.api.Categories.list().then(
      function success(response) {
        loading.style.display = 'none';

        var data = response.response;
        var suggest = Suggestions.load(data.categories, data.locale);
        suggest.then(
          function select(selected) {
            eme.log('resolved with', selected);
            var dataReady;

            if (Array.isArray(selected)) {
              // collections from categories
              // we have the web app icons in the response
              var collections = CategoryCollection.fromResponse(selected, data);
              dataReady = Promise.resolve(collections);
            } else {
              // collection from custom query
              // we make another request to get web app icons
              dataReady = new Promise(function getIcons(resolve) {
                eme.api.Apps.search({query: selected, limit: numAppIcons})
                  .then(function success(response) {
                    var webicons =
                    response.response.apps.slice(0,numAppIcons).map(
                      function each(app) {
                        return app.icon;
                    });

                    var collection = new QueryCollection({
                      query: selected,
                      webicons: webicons
                    });

                    resolve([collection]);
                  }, noIcons)
                  .catch(noIcons);

                  function noIcons(e) {
                    eme.log('noIcons', e);
                    resolve([new QueryCollection({query: selected})]);
                  }
              });
            }

            dataReady.then(function success(collections) {
              var iconsReady = [];
              collections.forEach(function doIcon(collection) {
                iconsReady.push(collection.renderIcon());
              });

              Promise.all(iconsReady).then(function then() {
                // TODO
                // 1. store a batch of collections at once. possible?
                // 2. we can store to db *before* icons is ready and once
                // the homescreen syncs it will update the icons
                var trxs = collections.map(CollectionsDatabase.add);
                Promise.all(trxs).then(done, done);
              }).catch(function _catch(ex) {
                eme.log('caught exception', ex);
                activity.postResult(false);
              });
            });

            function done() {
              activity.postResult(true);
            }
          },
          function cancel(reason) {
            eme.log('rejected with', reason);
            activity.postResult(false);
          });

    }, function error(reason) {
      eme.log('create-collection: error', reason);
      activity.postError(_(reason === 'network error' ?
                                 'network-error-message' : undefined));
    }).catch(function fail(ex) {
      eme.log('create-collection: failed', ex);
      activity.postError();
    });
  }

  navigator.mozSetMessageHandler('activity', function onActivity(activity) {
    if (activity.source.name === 'create-collection') {
      eme.init().then(function ready() {
        HandleCreate(activity);
      });
    }
  });

  // exporting handler so we can trigger it from testpage.js
  // without mozActivities since we can't debug activities in app manager
  exports.HandleCreate = HandleCreate;

}(window));
