/**
 * Copyright 2016 Jarrett Bariel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Library to connect using OAuth 2 to the CF API.
 *
 * @see CF API: API Docs @ https://apidocs.cloudfoundry.org
 */

/**
 * Node dependencies
 */
const Promise = require('promise');
const ClientOAuth2 = require('client-oauth2');
const https = require('https');

/**
 * CF API Version
 *
 * @see CF API Docs @ https://apidocs.cloudfoundry.org
 */
const API_VERSION = '/v2/';

/**
 * Custom exception
 * 
 * @param {String} err
 * @param {String} cause
 * @returns {object} CFClientException that can be accessed for more information
 *          properties are:
 *          <ul>
 *          <li><b>name</b> name of the error</li>
 *          <li><b>type</b> 'CFClientException'</li>
 *          <li><b>message</b> message provided when error was generated</li>
 *          <li><b>cause</b> deeper cause</li>
 *          <li><b>fileName</b> 'cfclient.js'</li>
 *          <li><b>lineNumber</b> line number of exception (if provided)</li>
 *          <li><b>stack</b> call stack of error</li>
 *          <li><b>toString()</b> clean print of message + cause</li>
 *          </ul>
 */
function CFClientException(err, cause) {
    rtn = {
        name: 'CFClientException',
        type: 'CFClientException',
        message: '',
        cause: cause,
        fileName: 'cfclient.js',
        lineNumber: '',
        stack: '',
        toString: function () {
            return this.message + ' ::: ' + this.cause;
        }
    };

    if (typeof err === 'object' && err.name === 'Error') {
        rtn.name = err.name;
        rtn.message = err.message;
        rtn.fileName = err.fileName || 'cfclient.js';
        rtn.lineNumber = err.lineNumber;
        rtn.stack = err.stack;
    }
    return rtn;
}

/**
 * Constructor for the CFClient.
 *
 * @param {CFConfig} config - configuration as defined in the README.md
 */
function CFClient(config) {
    if (!(config instanceof CFConfig)) {
        throw CFClientException(
            new Error('Given tokens must be an instance of CFConfig'),
            'tokens must be an instance of CFConfig that contains: "protocol", "host", "username", "password", "skipSslValidation');
    }

    this.config = config;
    this.infoData = null;
    this.client = null;
}

/**
 * Internal call to get the API info from the given host.
 *
 * @promise fulfill({JSON} infoData)
 * @promise reject({CFClientException} err)
 */
CFClient.prototype._getCfApiInfo = function () {
    const cf = this;
    return new Promise((fulfill, reject) => {
        var req = https.request({
            host: cf.config.host,
            port: cf.config.port,
            path: '/v2/info',
            method: 'GET',
            rejectUnauthorized: !cf.config.skipSslValidation,
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            res.setEncoding('utf-8');
            if (200 != res.statusCode) {
                reject(CFClientException('Failed with status code: ' + res.statusCode, 'Failed with status code: ' + res.statusCode));
            } else {
                var respStr = '';
                res.on('data', function (data) {
                    respStr += data;
                });
                res.on('end', function () {
                    fulfill(JSON.parse(respStr));
                });
            }
        });
        req.end();
        req.on('error', (e) => {
            reject(CFClientException('Error connecting', e));
        });
    });
};

/**
 * Internal call to get the OAuth2 token for the given credentials.
 *
 * @promise fulfill({ClientOAuth2Token} client)
 * @promise reject({object} err)
 */
CFClient.prototype._getCfOauth2Token = function () {
    const cf = this;
    return new Promise((fulfill, reject) => {
        if (!cf.infoData) {
            reject(CFClientException('Info data is not set', 'Need to set info data...'));
        } else {
            var cfAuth = new ClientOAuth2({
                clientId: 'cf',
                scopes: [''],
                authorizationUri: cf.infoData.authorization_endpoint + '/oauth/auth',
                accessTokenUri: cf.infoData.token_endpoint + '/oauth/token'
            });
            cfAuth.owner.getToken(cf.config.username, cf.config.password, {
                options: {
                    rejectUnauthorized: !cf.config.skipSslValidation
                }
            }).then(fulfill, reject);
        }
    });
};


/**
 * Connects using the given credentials.
 *
 * @see #_getCfApiInfo
 * @see #_getCfOauth2Token
 *
 * @promise fulfill() - setup and ready to make requests
 * @promise reject({object} err)
 */
CFClient.prototype.connect = function () {
    const cf = this;
    return new Promise((fulfill, reject) => {
        cf._getCfApiInfo().then((infoData) => {
            cf.infoData = infoData;
            cf._getCfOauth2Token().then((tokenClient) => {
                cf.client = tokenClient;
                fulfill();
            }, reject);
        }, reject);
    });
};

/**
 * Make a request using the given client - will check to make sure the token is valid before the request.
 *
 * @param {String} uri - URI that follows the API version (e.g. 'organizations' instead of /v2/organizations)
 * @param {String} method - optional param that specifies the request method.  Defaults to 'GET'
 *
 * @promise fulfill({JSON} responseBody)
 * @promise reject({object} err)
 */
CFClient.prototype.request = function (uri, method) {
    const cf = this;
    return new Promise((fulfill, reject) => {
        if (!cf.client) {
            reject(CFClientException('Client is not set', 'Need to set client...'));
        } else {
            if (cf.client.expired()) {
                cf.client.refresh().then(
                    (refreshedToken) => {
                        cf.client = refreshedToken;
                        cf._doRequest(uri, method).then(fulfill, reject);
                    },
                    () => {
                        cf.connect().then(
                            () => {
                                cf._doRequest(uri, method).then(fulfill, reject);
                            }, reject);
                    });
            }
            else {
                cf._doRequest(uri, method).then(fulfill, reject);
            }
        }
    });
};

/**
 * Make a request using the given client - which we assume to be connected and happy
 *
 * @param {String} uri - URI that follows the API version (e.g. 'organizations' instead of /v2/organizations)
 * @param {String} method - optional param that specifies the request method.  Defaults to 'GET'
 *
 * @promise fulfill({JSON} responseBody)
 * @promise reject({object} err)
 */
CFClient.prototype._doRequest = function (uri, method) {
    const cf = this;
    return new Promise((fulfill, reject) => {
        cf.client.request({
            url: cf.config.protocol + '://' + cf.config.host + API_VERSION + uri,
            method: method || 'GET',
            options: {
                rejectUnauthorized: !cf.config.skipSslValidation
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }).then((res) => {
            if (200 != res.status) {
                reject(CFClientException('Failed with status code: ' + res.statusCode, 'Failed with status code: ' + res.statusCode));
            } else {
                fulfill(JSON.stringify(res.body));
            }
        }, reject);
    });
};


/**
 * Object that helps to manage the configuration options.
 *
 * @param {object} config values
 *          properties are:
 *              <ul>
 *              <li><b>protocol</b> 'http' or 'https'</li>
 *              <li><b>host</b> FQDN or IP (e.g. api.mydomain.com)</li>
 *              <li><b>username</b> username for the CF API</li>
 *              <li><b>password</b> password for the given username</li>
 *              <li><b>skipSslValidation</b> enable for self-signed certs</li>
 *              </ul>
 */
function CFConfig(config) {
    this.protocol = config.protocol || 'http';
    this.host = config.host || 'api.bosh-lite.com';
    this.port = (('http' == config.protocol) ? 80 : 443);
    this.username = config.username || 'admin';
    this.password = config.password || 'admin';
    this.skipSslValidation = ('true' === config.skipSslValidation);
}

/**
 * All exports
 */
module.exports = {
    CFClient: CFClient,
    CFConfig: CFConfig
};
