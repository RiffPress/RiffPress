/* What a hand moves (the record out of its sleeve and turned over, the sleeve set down, the arm
 * carried), it moves as a hand does: on the minimum-jerk path, x = 10τ³ − 15τ⁴ + 6τ⁵ for τ from 0
 * to 1 (Flash and Hogan, 1985), which reaching movements follow, setting off and arriving with
 * neither speed nor acceleration. As an easing, the whole of it or the part from a to b, drawn with
 * linear() where a browser has it; elsewhere the nearest curve. turntable.css has the whole of it as
 * --riff-hand. */
const jerk = ( t ) => t * t * t * ( 10 - 15 * t + 6 * t * t );
const linear = !! window.CSS?.supports?.( 'animation-timing-function', 'linear(0, 1)' );

export function hand( a = 0, b = 1 ) {
	if ( ! linear && a === 0 && b === 1 ) {
		return 'cubic-bezier(0.5, 0, 0.5, 1)';
	}
	if ( ! linear ) {
		return a === 0 ? 'ease-in' : 'ease-out';
	}
	const points = [];
	for ( let i = 0; i <= 20; i++ ) {
		points.push( ( ( jerk( a + ( ( b - a ) * i ) / 20 ) - jerk( a ) ) / ( jerk( b ) - jerk( a ) ) ).toFixed( 3 ) );
	}
	return `linear(${ points.join( ', ' ) })`;
}
