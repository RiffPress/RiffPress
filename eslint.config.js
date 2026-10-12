/**
 * ESLint flat config. @wordpress/scripts runs ESLint 9, which reads only
 * this file; the project rules that used to live in .eslintrc.js are here.
 */
const wpPlugin = require( '@wordpress/eslint-plugin' );
const globals = require( 'globals' );

module.exports = [
	{
		ignores: [
			'**/build/**',
			'**/node_modules/**',
			'**/vendor/**',
			'**/artifacts/**',
		],
	},
	...wpPlugin.configs[ 'recommended-with-formatting' ],
	...wpPlugin.configs[ 'test-playwright' ].map( ( c ) => ( {
		...c,
		files: [ '**/tests/e2e/**/*.js' ],
	} ) ),
	{
		files: [ '**/*.js' ],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.serviceworker,
			},
			parserOptions: {
				requireConfigFile: false,
				babelOptions: {
					presets: [
						require.resolve( '@wordpress/babel-preset-default' ),
					],
				},
			},
		},
		rules: {
			// Workspaces: a test inside plugins/riff/ imports tooling the root package.json carries.
			'import/no-extraneous-dependencies': [
				'error',
				{ packageDir: __dirname },
			],
			'no-empty': [ 'error', { allowEmptyCatch: true } ],
			'@wordpress/no-global-active-element': 'off',
			'@wordpress/no-unused-vars-before-return': 'off', // a group of element lookups at the top of a function reads better together
			'no-mixed-operators': 'off', // arithmetic in the animations is clearer without a forest of parentheses
			'no-mixed-spaces-and-tabs': 'off', // Prettier's continuation-line alignment
			indent: 'off', // Prettier (wp-scripts format) owns indentation; the indent rule disagrees with it on continuation lines
			'comma-dangle': 'off', // Prettier owns trailing commas too; the rule wants them on calls, Prettier strips them
			'no-nested-ternary': 'off',
			'no-bitwise': 'off',
			'no-unused-expressions': [ 'error', { allowTernary: true } ],
		},
	},
];
