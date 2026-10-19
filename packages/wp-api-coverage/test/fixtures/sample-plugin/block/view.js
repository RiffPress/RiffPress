import { store } from '@wordpress/interactivity';
// import { select } from '@wordpress/data';
/* const apiFetch = require( '@wordpress/api-fetch' ); */

store( 'sample', {
	actions: {
		toggle() {
			const url = 'not wp.hooks, a string';
			return url;
		},
	},
} );
