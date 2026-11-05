/* Where the stylus is. The record's grooves run between the lead-out and the lead-in at 97% of its
 * radius, and playing time runs evenly across the radius, since a record's grooves keep one pitch
 * and one speed; leadOut is the lead-out's share of the radius, 0.4 on an LP and 0.56 on a single
 * (record.js). */
export const LEAD_IN = 0.97;

// How far from the centre, as a share of the radius, the groove is once a share of the album
// has played: playing time runs evenly across the radius.
export const groovedAt = ( played, leadOut ) => LEAD_IN - ( LEAD_IN - leadOut ) * played;

// The tonearm: its stylus on the groove as far in as the side has played, from the lead-in to the
// lead-out, so each angle is one moment of the side and the arm creeps inward through every track,
// as a stylus tracking the groove does. The arm turns on a base just off the record's corner
// (turntable.css): in the record's own width, the base at (1.05, 0.05), the arm pointing down at
// no turn, the centre at (0.5, 0.5). The turn that puts the stylus at a distance from the centre
// is found by halving, since the stylus only comes nearer the centre as the arm turns in.
export const BASE = [ 1.05, 0.05 ];
export const REST = -14;
// The arm's length and its headshell's angle, set up as a deck's are, by Baerwald's alignment:
// no tracking error where the stylus is 66 and 120.9 mm from the spindle. With the stylus r
// from the spindle on an arm L long that turns d from it, the arm meets the groove's tangent
// at the angle whose sine is (r² + L² − d²) / 2rL, and a headshell turned in by β puts the
// stylus along the groove where that sine is sin β: where r² − 2rL·sin β + L² − d² = 0. The
// nulls are its two roots, so r₁·r₂ = L² − d² and r₁ + r₂ = 2L·sin β. The base fixes d, so
// L = √(d² + r₁r₂) and β = asin((r₁ + r₂) / 2L): with a 12-inch record 302 mm across, d is
// 214.6 mm, L 232.5 mm (17.8 mm of overhang past the spindle) and β 23.7°.
const MM = 302;
const NULLS = [ 66, 120.9 ];
const SPAN = Math.hypot( BASE[ 0 ] - 0.5, BASE[ 1 ] - 0.5 ) * MM;
const LENGTH = Math.sqrt( SPAN * SPAN + NULLS[ 0 ] * NULLS[ 1 ] );
export const OFFSET = Math.asin( ( NULLS[ 0 ] + NULLS[ 1 ] ) / ( 2 * LENGTH ) );
export const ARM = LENGTH / MM;

export function angle( played, leadOut ) {
	const want = 0.5 * groovedAt( played, leadOut );
	const away = ( deg ) => {
		const r = ( deg * Math.PI ) / 180;
		return Math.hypot( BASE[ 0 ] - ARM * Math.sin( r ) - 0.5, BASE[ 1 ] + ARM * Math.cos( r ) - 0.5 );
	};
	let lo = 0;
	let hi = 50;
	for ( let i = 0; i < 20; i++ ) {
		const mid = ( lo + hi ) / 2;
		if ( away( mid ) > want ) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

// The share of the side under the stylus with the arm at an angle, from its distance to the
// record's centre.
export function playedOf( deg, leadOut ) {
	const r = ( deg * Math.PI ) / 180;
	const out = Math.hypot( BASE[ 0 ] - ARM * Math.sin( r ) - 0.5, BASE[ 1 ] + ARM * Math.cos( r ) - 0.5 ) / 0.5;
	return Math.min( 1, Math.max( 0, ( LEAD_IN - out ) / ( LEAD_IN - leadOut ) ) );
}
