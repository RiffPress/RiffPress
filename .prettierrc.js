/**
 * WordPress's Prettier style, which `wp-scripts format` and the editors' Prettier both read, with
 * the one rule .editorconfig adds: JSON, YAML and Markdown are indented with two spaces.
 */
const wordpress = require( '@wordpress/prettier-config' );

module.exports = {
	...wordpress,
	overrides: [
		...wordpress.overrides,
		{
			files: '*.{json,yml,yaml,md}',
			options: { useTabs: false, tabWidth: 2 },
		},
	],
};
