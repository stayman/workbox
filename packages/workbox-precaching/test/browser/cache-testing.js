/*
 Copyright 2016 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/* eslint-env mocha, browser */

import {dbName} from '../../src/lib/constants.js';

describe(`workbox-precaching Test Revisioned Caching`, function() {
  const STATIC_ASSETS_PATH = '/packages/workbox-precaching/test/static';

  const deleteIndexedDB = () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject();
      req.onblocked = () => {
        console.error('Database deletion is blocked.');
        reject();
      };
    });
  };

  beforeEach(function() {
    return window.goog.swUtils.cleanState()
    .then(deleteIndexedDB);
  });

  afterEach(function() {
    return window.goog.swUtils.cleanState()
    .then(deleteIndexedDB);
  });

  const testCacheEntries = (fileSet) => {
    return window.caches.keys()
    .then((cacheNames) => {
      cacheNames.length.should.equal(1);
      return window.caches.open(cacheNames[0]);
    })
    .then((cache) => cache.keys())
    .then((cachedResponses) => {
      cachedResponses.length.should.equal(fileSet.length);

      fileSet.forEach((assetAndHash) => {
        let matchingResponse = null;
        cachedResponses.forEach((cachedResponse) => {
          let desiredPath = assetAndHash;
          if (typeof assetAndHash !== 'string') {
            desiredPath = assetAndHash.url;
          }

          if (cachedResponse.url.indexOf(desiredPath) !== -1) {
            matchingResponse = cachedResponse;
            return;
          }
        });

        expect(matchingResponse).to.exist;
      });
    });
  };

  const testFileSet = (iframe, swPath, fileSet) => {
    return testCacheEntries(fileSet)
    .then(() => {
      let responses = {};
      const promises = fileSet.map((assetAndHash) => {
        let url = assetAndHash;
        if (typeof assetAndHash === 'object') {
          url = assetAndHash.url;
        }

        // This handles relative URL's that will be relative to the service
        // worker's path.
        const parsedURL = new URL(
          url,
          new URL(swPath, location).toString()
        ).toString();
        return iframe.contentWindow.fetch(new URL(parsedURL))
        .then((cachedResponse) => {
          if (cachedResponse.type === 'opaque') {
            responses[url] = null;
          } else {
            return cachedResponse.text()
            .then((bodyText) => {
              responses[url] = bodyText;
            });
          }
        });
      });
      return Promise.all(promises)
      .then(() => {
        return responses;
      });
    });
  };

  const compareRevisionedCachedAssets = (beforeData, afterData) => {
    afterData.cacheList.forEach((afterAssetAndHash) => {
      if (typeof afterAssetAndHash === 'string') {
        afterAssetAndHash = {url: afterAssetAndHash, revision: afterAssetAndHash};
      }

      let matchingBeforeAssetAndHash = null;
      beforeData.cacheList.forEach((beforeAssetAndHash) => {
        if (typeof beforeAssetAndHash === 'string') {
          beforeAssetAndHash = {url: beforeAssetAndHash, revision: beforeAssetAndHash};
        }

        if (beforeAssetAndHash.url === afterAssetAndHash.url) {
          matchingBeforeAssetAndHash = beforeAssetAndHash;
        }
      });

      if (!matchingBeforeAssetAndHash) {
        return;
      }

      const beforeResponseBody = beforeData.cachedResponses[afterAssetAndHash.url];
      const afterResponseBody = afterData.cachedResponses[afterAssetAndHash.url];

      if (matchingBeforeAssetAndHash.revision === afterAssetAndHash.revision) {
        // The request should be the same
        beforeResponseBody.should.equal(afterResponseBody);
      } else {
        // The request should be different
        beforeResponseBody.should.not.equal(afterResponseBody);
      }
    });
  };

  it(`should cache and fetch revisioned urls`, function() {
    const sw1 = `${STATIC_ASSETS_PATH}/basic-cache/basic-revisioned-cache-sw.js`;
    const sw2 = `${STATIC_ASSETS_PATH}/basic-cache/basic-revisioned-cache-sw-2.js`;

    return window.goog.swUtils.activateSW(sw1)
    .then((iframe) => {
      return testFileSet(iframe, sw1, workbox.__TEST_DATA['set-1']['step-1']);
    })
    .then((step1Responses) => {
      return window.goog.swUtils.activateSW(sw2)
      .then((iframe) => {
        return testFileSet(iframe, sw2, workbox.__TEST_DATA['set-1']['step-2']);
      })
      .then((step2Responses) => {
        compareRevisionedCachedAssets({
          cacheList: workbox.__TEST_DATA['set-1']['step-1'],
          cachedResponses: step1Responses,
        }, {
          cacheList: workbox.__TEST_DATA['set-1']['step-2'],
          cachedResponses: step2Responses,
        });
      });
    });
  });

  it.skip(`should cache and fetch unrevisioned urls`, function() {
    const sw1 = `${STATIC_ASSETS_PATH}/basic-cache/basic-unrevisioned-cache-sw.js`;
    const sw2 = `${STATIC_ASSETS_PATH}/basic-cache/basic-unrevisioned-cache-sw-2.js`;
    return window.goog.swUtils.activateSW(sw1)
    .then((iframe) => {
      return testFileSet(iframe, sw1, workbox.__TEST_DATA['set-2']['step-1']);
    })
    .then((step1Responses) => {
      return window.goog.swUtils.activateSW(sw2)
      .then((iframe) => {
        return testFileSet(iframe, sw2, workbox.__TEST_DATA['set-2']['step-2']);
      });
    });
  });

  it(`should manage revisioned cache deletion`, function() {
    const sw1 = `${STATIC_ASSETS_PATH}/basic-cache/basic-revisioned-cache-sw.js`;
    const sw2 = `${STATIC_ASSETS_PATH}/basic-cache/basic-revisioned-cache-sw-2.js`;
    return window.goog.swUtils.activateSW(sw1)
    .then((iframe) => {
      return testFileSet(iframe, sw1, workbox.__TEST_DATA['set-1']['step-1']);
    })
    .then((step1Responses) => {
      return window.goog.swUtils.clearAllCaches()
      .then(() => {
        return window.goog.swUtils.activateSW(sw2);
      })
      .then((iframe) => {
        return testFileSet(iframe, sw2, workbox.__TEST_DATA['set-1']['step-2']);
      });
    });
  });

  it.skip(`should manage unrevisioned cache deletion`, function() {
    const sw1 = `${STATIC_ASSETS_PATH}/basic-cache/basic-unrevisioned-cache-sw.js`;
    const sw2 = `${STATIC_ASSETS_PATH}/basic-cache/basic-unrevisioned-cache-sw-2.js`;
    return window.goog.swUtils.activateSW(sw1)
    .then((iframe) => {
      return testFileSet(iframe, sw1, workbox.__TEST_DATA['set-2']['step-1']);
    })
    .then((step1Responses) => {
      return window.goog.swUtils.clearAllCaches()
      .then(() => {
        return window.goog.swUtils.activateSW(sw2);
      })
      .then((iframe) => {
        return testFileSet(iframe, sw2, workbox.__TEST_DATA['set-2']['step-2']);
      });
    });
  });

  it(`should manage revisioned indexedDB deletion`, function() {
    const sw1 = `${STATIC_ASSETS_PATH}/basic-cache/basic-revisioned-cache-sw.js`;
    const sw2 = `${STATIC_ASSETS_PATH}/basic-cache/basic-revisioned-cache-sw-2.js`;
    return window.goog.swUtils.activateSW(sw1)
    .then((iframe) => {
      return testFileSet(iframe, sw1, workbox.__TEST_DATA['set-1']['step-1']);
    })
    .then((step1Responses) => {
      return deleteIndexedDB()
      .then(() => {
        return window.goog.swUtils.activateSW(sw2);
      })
      .then((iframe) => {
        return testFileSet(iframe, sw2, workbox.__TEST_DATA['set-1']['step-2']);
      });
    });
  });

  it(`should only request revisioned duplicate entries once`, function() {
    let allEntries = [];
    workbox.__TEST_DATA['duplicate-entries'].forEach((entries) => {
      allEntries = allEntries.concat(entries);
    });
    allEntries = [...new Set(allEntries)];

    const swPath = `${STATIC_ASSETS_PATH}/duplicate-entries/duplicate-entries-revisioned-sw.js`;
    return window.goog.swUtils.activateSW(swPath)
    .then((iframe) => {
      return iframe.contentWindow.fetch('/__api/get-requests-made/')
      .then((response) => {
        return response.json();
      })
      .then((requestsMade) => {
        if (allEntries.length !== requestsMade.length) {
          throw new Error('Requests made does not equal the list of de-duped cache entries. Requests Made are: ' + JSON.stringify(requestsMade));
        }
      })
      .then(() => {
        return iframe;
      });
    })
    .then((iframe) => {
      return testFileSet(iframe, swPath, allEntries);
    });
  });

  it.skip(`should only request unrevisioned duplicate entries once`, function() {
    let allEntries = [];
    workbox.__TEST_DATA['duplicate-entries'].forEach((entries) => {
      allEntries = allEntries.concat(entries);
    });
    allEntries = [...new Set(allEntries)];

    const swPath = `${STATIC_ASSETS_PATH}/duplicate-entries/duplicate-entries-unrevisioned-sw.js`;
    return window.goog.swUtils.activateSW(swPath)
    .then((iframe) => {
      return iframe.contentWindow.fetch('/__api/get-requests-made/')
      .then((response) => {
        return response.json();
      })
      .then((requestsMade) => {
        if (allEntries.length !== requestsMade.length) {
          throw new Error('Duplicate requests have been made: ' + JSON.stringify(requestsMade));
        }
      })
      .then(() => {
        return iframe;
      });
    })
    .then((iframe) => {
      return testFileSet(iframe, swPath, allEntries);
    });
  });

  it(`should manage redirected revisioned requests`, function() {
    return window.goog.swUtils.activateSW(`${STATIC_ASSETS_PATH}/response-types/redirect-revisioned-sw.js`)
    .then((iframe) => {
      const promises = workbox.__TEST_DATA['redirect'].map((redirectPath) => {
        const sections = redirectPath.split('/').filter((section) => {
          return section !== '';
        });
        const expectedResponse = sections[sections.length - 1];
        return iframe.contentWindow.fetch(redirectPath)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Response NOT ok.');
          }
          return response.text();
        })
        .then((responseText) => {
          if (responseText !== expectedResponse) {
            throw new Error('Unexpected response: ' + redirectPath);
          }
        });
      });
      return Promise.all(promises);
    });
  });

  it.skip(`should manage redirected unrevisioned requests`, function() {
    return window.goog.swUtils.activateSW(`${STATIC_ASSETS_PATH}/response-types/redirect-unrevisioned-sw.js`)
    .then((iframe) => {
      const promises = workbox.__TEST_DATA['redirect'].map((redirectPath) => {
        const sections = redirectPath.split('/').filter((section) => {
          return section !== '';
        });
        const expectedResponse = sections[sections.length - 1];
        return iframe.contentWindow.fetch(redirectPath)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Response NOT ok.');
          }
          return response.text();
        })
        .then((responseText) => {
          if (responseText !== expectedResponse) {
            throw new Error('Unexpected response: ' + redirectPath);
          }
        });
      });
      return Promise.all(promises);
    });
  });
});
