# JS CFClient 
NPM that can be used to access the [CloudFoundry API](https://apidocs.cloudfoundry.org).

## Getting started
Install the npm in your project `npm install --save js-cfclient`

Add `require` statement

`const CF = require('js-cfclient');`

Initialize the client with the following information:

* `protocol` => `http` or `https`
* `host` => FQDN or IP address of the PCF or CF host (e.g. `api.mydomain.com`)
* `username` => Username to access the api
* `password` => Password for the given username
* `skipSslValidation` => Set to `true` when using self-signed certs

```
const CfClient = new CF.CFClient(new CF.CFConfig({
    protocol: 'https',
    host: 'api.myhost.com',
    username: 'admin',
    password: 'admin',
    skipSslValidation: true
}));
```

The `CFClient` uses [Promises](https://www.npmjs.com/package/promise) to manage callbacks.

Once you have configured the `CFClient` you can `connect()` and then respond accordingly.

```
CfClient.connect().then(() => {
    CfClient.request('organizations').then((resp) => {
        console.log('Response: ' + JSON.stringify(resp));
    }, console.error);
    CfClient.request('apps').then((resp) => {
        console.log('Response: ' + JSON.stringify(resp));
    }, console.error);
}, console.error);
```

# Example project
You can find an example project [here](https://github.com/jbariel/cfclient-server-js)

# Issues
Please use the [Issues tab](../../issues) to report any problems or feature requests.
