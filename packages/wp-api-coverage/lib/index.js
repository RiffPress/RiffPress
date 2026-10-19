/**
 * wp-api-coverage: which WordPress APIs a plugin uses, and which it does not use yet.
 */
const { coverage } = require( './coverage.js' );
const { formatText } = require( './report.js' );
const { scanPlugin } = require( './scan.js' );

module.exports = { coverage, formatText, scanPlugin };
