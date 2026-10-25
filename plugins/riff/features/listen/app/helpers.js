/* What every module of the app shares: escaping for markup the app writes, a sprintf for one
 * value, and a JSON parse that answers null to anything that is not JSON. */

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

export function parse( json ) {
	try {
		return json ? JSON.parse( json ) : null;
	} catch {
		return null;
	}
}
