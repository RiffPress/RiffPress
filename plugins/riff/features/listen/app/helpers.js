/* What every module of the app shares: escaping for markup the app writes and a sprintf for one
 * value; and, the player's own, JSON and storage that never throw, a route's address and a picture's average colour. */

export { average, parse, read, route, write } from 'riff-player/helpers';

export function esc( s ) {
	return String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}

export function fmt( pattern, value ) {
	return String( pattern || '%s' ).replace( /%(1\$)?s/, String( value ) );
}
