/* The turntable, drawn. Where the browser has WebGL2, the deck, the record and the tonearm are a
 * scene lit as a deck on a desk is: a key light that casts the arm's shadow across the record, a
 * dark room in the metal, and grooves that scatter the light as a cut record's do, in streaks
 * across the tracks, wider where the music is loud. The scene is the whole of Now Playing: the desk
 * the deck stands on is the page's own background, lit round the deck and darker toward its
 * edges, with the deck's shadow and the sleeve's on it, and at its back, against the wall, a ledge
 * the sleeve stands on while its record plays.
 *
 * One eye sees it, the same for everyone at every size: a listener's in their chair across the
 * desk, low, about 20° above the deck, and still. Nothing moves it: not the layout, not the device,
 * not a change of record, which plays out in front of it as a hand does it.
 *
 * It draws, and lays the page's deck where it draws it. The deck in the page (player.php, riff.css)
 * is the turntable's control layer, never painted: now-playing.js moves its record, its platter and
 * its arm, a hand takes the arm by its grip, and a screen reader finds its slider. The page's arm,
 * cue and keys are given a transform from the eye, each in its own plane, so they are hit, focused
 * and read where they are drawn, and P.flat takes a point of the screen back to the page's flat
 * deck for now-playing.js's own geometry. Each key reaches past its drawn cap far enough to be
 * pressed (44px under a finger, 24px under a mouse), never into its neighbour's. Each frame this
 * reads where those are (the record's place and turn, the arm's angle, the cue lever) and draws
 * them there. Without WebGL2, on a card too slow for it, once the context is lost or in forced
 * colours, it says so (P.drawable), and Now Playing is the cover on its own. Loaded on demand, when
 * the turntable first shows.
 *
 * The scene's lighting and its mesh builders are adapted from Guillermo Rauch's record player,
 * https://github.com/rauchg/vinyl, under the MIT License:
 *
 * Copyright (c) 2026 Guillermo Rauch
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 * NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */
import { readable } from 'riff-player/helpers';

// ---- Matrices, column-major, and meshes, six numbers a vertex: where it is and its normal.
const mul = ( a, b ) => {
	const o = new Float32Array( 16 );
	for ( let c = 0; c < 4; c++ ) {
		for ( let r = 0; r < 4; r++ ) {
			o[ c * 4 + r ] = a[ r ] * b[ c * 4 ] + a[ 4 + r ] * b[ c * 4 + 1 ] + a[ 8 + r ] * b[ c * 4 + 2 ] + a[ 12 + r ] * b[ c * 4 + 3 ];
		}
	}
	return o;
};
const chain = ( ...m ) => m.reduce( mul );
const ident = () => new Float32Array( [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 ] );
const move = ( x, y, z = 0 ) => {
	const m = ident();
	m[ 12 ] = x;
	m[ 13 ] = y;
	m[ 14 ] = z;
	return m;
};
// A key cap, down by dz and leaning by a little about its own middle (cx, cy, cz): the side under
// the finger lower than the other.
const lean = ( cx, cy, cz, dz, ax, ay ) => {
	const m = ident();
	m[ 2 ] = -ax;
	m[ 6 ] = -ay;
	m[ 8 ] = ax;
	m[ 9 ] = ay;
	m[ 12 ] = -ax * cz;
	m[ 13 ] = -ay * cz;
	m[ 14 ] = ax * cx + ay * cy + dz;
	return m;
};
const size = ( x, y ) => {
	const m = ident();
	m[ 0 ] = x;
	m[ 5 ] = y;
	return m;
};
const turnZ = ( a ) => {
	const m = ident();
	const c = Math.cos( a );
	const s = Math.sin( a );
	m[ 0 ] = c;
	m[ 1 ] = s;
	m[ 4 ] = -s;
	m[ 5 ] = c;
	return m;
};
const turnY = ( a ) => {
	const m = ident();
	const c = Math.cos( a );
	const s = Math.sin( a );
	m[ 0 ] = c;
	m[ 2 ] = -s;
	m[ 8 ] = s;
	m[ 10 ] = c;
	return m;
};
const turnX = ( a ) => {
	const m = ident();
	const c = Math.cos( a );
	const s = Math.sin( a );
	m[ 5 ] = c;
	m[ 6 ] = s;
	m[ 9 ] = -s;
	m[ 10 ] = c;
	return m;
};
// A view whose window need not be centred on the eye: its edges at the near plane.
function frustum( l, r, b, t, n, f ) {
	const m = new Float32Array( 16 );
	m[ 0 ] = ( 2 * n ) / ( r - l );
	m[ 5 ] = ( 2 * n ) / ( t - b );
	m[ 8 ] = ( r + l ) / ( r - l );
	m[ 9 ] = ( t + b ) / ( t - b );
	m[ 10 ] = ( f + n ) / ( n - f );
	m[ 11 ] = -1;
	m[ 14 ] = ( 2 * f * n ) / ( n - f );
	return m;
}
function ortho( l, r, b, t, n, f ) {
	const m = new Float32Array( 16 );
	m[ 0 ] = 2 / ( r - l );
	m[ 5 ] = 2 / ( t - b );
	m[ 10 ] = -2 / ( f - n );
	m[ 12 ] = -( r + l ) / ( r - l );
	m[ 13 ] = -( t + b ) / ( t - b );
	m[ 14 ] = -( f + n ) / ( f - n );
	m[ 15 ] = 1;
	return m;
}
const sub = ( a, b ) => [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];
const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
const unit = ( a ) => {
	const l = Math.hypot( ...a );
	return a.map( ( x ) => x / l );
};
function lookAt( eye, at, upHint = [ 0, 0, 1 ] ) {
	const f = unit( sub( at, eye ) );
	return viewOf( eye, f, unit( cross( f, upHint ) ) );
}
// A view from the eye along f, its right r.
function viewOf( eye, f, r ) {
	const u = cross( r, f );
	const dot = ( a ) => a[ 0 ] * eye[ 0 ] + a[ 1 ] * eye[ 1 ] + a[ 2 ] * eye[ 2 ];
	return new Float32Array( [ r[ 0 ], u[ 0 ], -f[ 0 ], 0, r[ 1 ], u[ 1 ], -f[ 1 ], 0, r[ 2 ], u[ 2 ], -f[ 2 ], 0, -dot( r ), -dot( u ), dot( f ), 1 ] );
}

const tri = ( v, a, b, c ) => {
	v.push( ...a, ...b, ...c );
};
const TAU = 2 * Math.PI;
// A cylinder or a cone about +z, from z0 (radius r0) to z1 (radius r1).
function cyl( r0, r1, z0, z1, seg = 64, caps = true ) {
	const v = [];
	const sl = ( r0 - r1 ) / ( z1 - z0 );
	for ( let i = 0; i < seg; i++ ) {
		const a0 = ( i / seg ) * TAU;
		const a1 = ( ( i + 1 ) / seg ) * TAU;
		const [ c0, s0, c1, s1 ] = [ Math.cos( a0 ), Math.sin( a0 ), Math.cos( a1 ), Math.sin( a1 ) ];
		const n0 = unit( [ c0, s0, sl ] );
		const n1 = unit( [ c1, s1, sl ] );
		const A = [ r0 * c0, r0 * s0, z0, ...n0 ];
		const B = [ r0 * c1, r0 * s1, z0, ...n1 ];
		const C = [ r1 * c1, r1 * s1, z1, ...n1 ];
		const D = [ r1 * c0, r1 * s0, z1, ...n0 ];
		tri( v, A, B, C );
		tri( v, A, C, D );
		if ( caps ) {
			tri( v, [ 0, 0, z1, 0, 0, 1 ], [ r1 * c0, r1 * s0, z1, 0, 0, 1 ], [ r1 * c1, r1 * s1, z1, 0, 0, 1 ] );
			tri( v, [ 0, 0, z0, 0, 0, -1 ], [ r0 * c1, r0 * s1, z0, 0, 0, -1 ], [ r0 * c0, r0 * s0, z0, 0, 0, -1 ] );
		}
	}
	return new Float32Array( v );
}
// A mesh about +z, laid along +x.
function alongX( v ) {
	for ( let i = 0; i < v.length; i += 3 ) {
		const [ x, y, z ] = [ v[ i ], v[ i + 1 ], v[ i + 2 ] ];
		v[ i ] = z;
		v[ i + 1 ] = x;
		v[ i + 2 ] = y;
	}
	return v;
}
function box( x0, y0, z0, x1, y1, z1 ) {
	const v = [];
	const q = ( a, b, c, d, n ) => {
		tri( v, [ ...a, ...n ], [ ...b, ...n ], [ ...c, ...n ] );
		tri( v, [ ...a, ...n ], [ ...c, ...n ], [ ...d, ...n ] );
	};
	q( [ x0, y0, z1 ], [ x1, y0, z1 ], [ x1, y1, z1 ], [ x0, y1, z1 ], [ 0, 0, 1 ] );
	q( [ x0, y1, z0 ], [ x1, y1, z0 ], [ x1, y0, z0 ], [ x0, y0, z0 ], [ 0, 0, -1 ] );
	q( [ x0, y0, z0 ], [ x1, y0, z0 ], [ x1, y0, z1 ], [ x0, y0, z1 ], [ 0, -1, 0 ] );
	q( [ x1, y1, z0 ], [ x0, y1, z0 ], [ x0, y1, z1 ], [ x1, y1, z1 ], [ 0, 1, 0 ] );
	q( [ x1, y0, z0 ], [ x1, y1, z0 ], [ x1, y1, z1 ], [ x1, y0, z1 ], [ 1, 0, 0 ] );
	q( [ x0, y1, z0 ], [ x0, y0, z0 ], [ x0, y0, z1 ], [ x0, y1, z1 ], [ -1, 0, 0 ] );
	return new Float32Array( v );
}
// A flat ring at z = 0.
function annulus( r0, r1, nr = 2, na = 160 ) {
	const v = [];
	const p = ( i, j ) => {
		const r = r0 + ( ( r1 - r0 ) * i ) / nr;
		const a = ( j / na ) * TAU;
		return [ r * Math.cos( a ), r * Math.sin( a ), 0, 0, 0, 1 ];
	};
	for ( let i = 0; i < nr; i++ ) {
		for ( let j = 0; j < na; j++ ) {
			tri( v, p( i, j ), p( i + 1, j ), p( i + 1, j + 1 ) );
			tri( v, p( i, j ), p( i + 1, j + 1 ), p( i, j + 1 ) );
		}
	}
	return new Float32Array( v );
}
// A surface turned on a lathe about +z: pts are [ radius, height ], from the bottom's middle out,
// up and back in, each stretch flat.
function lathe( pts, seg = 72 ) {
	const v = [];
	for ( let k = 0; k + 1 < pts.length; k++ ) {
		const [ r0, z0 ] = pts[ k ];
		const [ r1, z1 ] = pts[ k + 1 ];
		const l = Math.hypot( r1 - r0, z1 - z0 ) || 1;
		const nr = ( z1 - z0 ) / l;
		const nz = -( r1 - r0 ) / l;
		for ( let i = 0; i < seg; i++ ) {
			const a0 = ( i / seg ) * TAU;
			const a1 = ( ( i + 1 ) / seg ) * TAU;
			const [ c0, s0, c1, s1 ] = [ Math.cos( a0 ), Math.sin( a0 ), Math.cos( a1 ), Math.sin( a1 ) ];
			const A = [ r0 * c0, r0 * s0, z0, nr * c0, nr * s0, nz ];
			const B = [ r0 * c1, r0 * s1, z0, nr * c1, nr * s1, nz ];
			const C = [ r1 * c1, r1 * s1, z1, nr * c1, nr * s1, nz ];
			const D = [ r1 * c0, r1 * s0, z1, nr * c0, nr * s0, nz ];
			tri( v, A, B, C );
			tri( v, A, C, D );
		}
	}
	return new Float32Array( v );
}
// A round tube along a line of points.
function tube( path, r, seg = 16 ) {
	const v = [];
	const rings = path.map( ( p, i ) => {
		const t = unit( sub( path[ Math.min( path.length - 1, i + 1 ) ], path[ Math.max( 0, i - 1 ) ] ) );
		const n = unit( cross( [ 0, 0, 1 ], t ) );
		const bn = cross( t, n );
		const ring = [];
		for ( let j = 0; j <= seg; j++ ) {
			const c = Math.cos( ( j / seg ) * TAU );
			const s = Math.sin( ( j / seg ) * TAU );
			const d = [ 0, 1, 2 ].map( ( k ) => n[ k ] * c + bn[ k ] * s );
			ring.push( [ p[ 0 ] + r * d[ 0 ], p[ 1 ] + r * d[ 1 ], p[ 2 ] + r * d[ 2 ], ...d ] );
		}
		return ring;
	} );
	for ( let i = 0; i + 1 < rings.length; i++ ) {
		for ( let j = 0; j < seg; j++ ) {
			tri( v, rings[ i ][ j ], rings[ i + 1 ][ j ], rings[ i + 1 ][ j + 1 ] );
			tri( v, rings[ i ][ j ], rings[ i + 1 ][ j + 1 ], rings[ i ][ j + 1 ] );
		}
	}
	return new Float32Array( v );
}
function bezier( p0, p1, p2, p3, n = 24 ) {
	const out = [];
	for ( let i = 0; i <= n; i++ ) {
		const t = i / n;
		const u = 1 - t;
		out.push( p0.map( ( _, k ) => u * u * u * p0[ k ] + 3 * u * u * t * p1[ k ] + 3 * u * t * t * p2[ k ] + t * t * t * p3[ k ] ) );
	}
	return out;
}
// A slab with rounded corners and its top edge chamfered.
function rbox( x0, y0, x1, y1, z0, z1, rad = 0.004, ch = 0.001, n = 6 ) {
	const o = [];
	const v = [];
	for ( const [ cx, cy, a0 ] of [ [ x1 - rad, y1 - rad, 0 ], [ x0 + rad, y1 - rad, 0.5 ], [ x0 + rad, y0 + rad, 1 ], [ x1 - rad, y0 + rad, 1.5 ] ] ) {
		for ( let i = 0; i <= n; i++ ) {
			const a = ( a0 + ( 0.5 * i ) / n ) * Math.PI;
			o.push( [ cx + rad * Math.cos( a ), cy + rad * Math.sin( a ), Math.cos( a ), Math.sin( a ) ] );
		}
	}
	const zc = z1 - ch;
	const k = Math.SQRT1_2;
	const mid = [ ( x0 + x1 ) / 2, ( y0 + y1 ) / 2 ];
	for ( let i = 0; i < o.length; i++ ) {
		const a = o[ i ];
		const b = o[ ( i + 1 ) % o.length ];
		const ai = [ a[ 0 ] - a[ 2 ] * ch, a[ 1 ] - a[ 3 ] * ch ];
		const bi = [ b[ 0 ] - b[ 2 ] * ch, b[ 1 ] - b[ 3 ] * ch ];
		tri( v, [ a[ 0 ], a[ 1 ], z0, a[ 2 ], a[ 3 ], 0 ], [ b[ 0 ], b[ 1 ], z0, b[ 2 ], b[ 3 ], 0 ], [ b[ 0 ], b[ 1 ], zc, b[ 2 ], b[ 3 ], 0 ] );
		tri( v, [ a[ 0 ], a[ 1 ], z0, a[ 2 ], a[ 3 ], 0 ], [ b[ 0 ], b[ 1 ], zc, b[ 2 ], b[ 3 ], 0 ], [ a[ 0 ], a[ 1 ], zc, a[ 2 ], a[ 3 ], 0 ] );
		tri( v, [ a[ 0 ], a[ 1 ], zc, a[ 2 ] * k, a[ 3 ] * k, k ], [ b[ 0 ], b[ 1 ], zc, b[ 2 ] * k, b[ 3 ] * k, k ], [ bi[ 0 ], bi[ 1 ], z1, b[ 2 ] * k, b[ 3 ] * k, k ] );
		tri( v, [ a[ 0 ], a[ 1 ], zc, a[ 2 ] * k, a[ 3 ] * k, k ], [ bi[ 0 ], bi[ 1 ], z1, b[ 2 ] * k, b[ 3 ] * k, k ], [ ai[ 0 ], ai[ 1 ], z1, a[ 2 ] * k, a[ 3 ] * k, k ] );
		tri( v, [ ...mid, z1, 0, 0, 1 ], [ ...ai, z1, 0, 0, 1 ], [ ...bi, z1, 0, 0, 1 ] );
	}
	return new Float32Array( v );
}
// Meshes as one, each moved by its own [ x, y, z ] where it is given with one.
function merge( ...parts ) {
	const items = parts.map( ( p ) => ( Array.isArray( p ) ? p : [ p, [ 0, 0, 0 ] ] ) );
	const out = new Float32Array( items.reduce( ( a, [ d ] ) => a + d.length, 0 ) );
	let o = 0;
	for ( const [ d, off ] of items ) {
		for ( let i = 0; i < d.length; i += 6 ) {
			out[ o++ ] = d[ i ] + off[ 0 ];
			out[ o++ ] = d[ i + 1 ] + off[ 1 ];
			out[ o++ ] = d[ i + 2 ] + ( off[ 2 ] || 0 );
			out[ o++ ] = d[ i + 3 ];
			out[ o++ ] = d[ i + 4 ];
			out[ o++ ] = d[ i + 5 ];
		}
	}
	return out;
}
const at = ( d, x, y, z = 0 ) => [ d, [ x, y, z ] ];

// ---- The deck, in metres, the spindle at the origin, +x to the right, +y away, +z up, the
// record's top at z = 0. A record is 302 mm across, and the deck in the page is laid out in the
// record's own width (riff.css), so every place here is that place there: the plinth from 5% left
// of the record to 26% right of it and from 13% above it to 5% below, the platter 3.5% wider all
// round, the arm's base, its rest, the anti-skate dial and the target light where the page has
// them.
const MM = 0.302;
const R = MM / 2;
const PLATTER = R * 1.035 + 0.0064;
// How high a record is lifted to come off the spindle, which stands 11.5 mm over the mat.
const SPINDLE = 0.016;
const DECK_Z = -0.022;
const FLOOR_Z = -0.05;
const PIVOT_H = 0.03;
const BODY = [ -0.555 * MM, -0.555 * MM, 0.775 * MM, 0.63 * MM ];
// The deck with its keys, on the strip they stand on along the front. Each key is its left, width,
// top and height, in the record's width, where riff.css has the buttons, and where its lamp is, if
// it has one. The
// lamps are the one amber, as a deck's are: this light, once tone-mapped, is the display's own
// amber (riff.css, .riff-level), where a brighter one would wash out to cream.
const AMBER = [ 2.6, 0.48, 0.17 ];
const FRONT = -0.69 * MM;
const KEYS = [
	[ 0, 0.18, 1.075, 0.095, 'left' ],
	[ 0.215, 0.075, 1.09, 0.075, 'top' ],
	[ 0.3, 0.075, 1.09, 0.075, 'top' ],
	[ 0.41, 0.08, 1.09, 0.075, '' ],
	[ 0.5, 0.08, 1.09, 0.075, '' ],
	[ 0.615, 0.075, 1.09, 0.075, 'top' ],
	[ 0.7, 0.075, 1.09, 0.075, 'top' ],
];
// The deck with them: its plinth, its keys, where each key's middle is and half its size, and where
// each lamp is, with its key's place, for the light it spills.
const DECK = {
	body: [ BODY[ 0 ], FRONT, BODY[ 2 ], BODY[ 3 ] ],
	keys: KEYS,
	caps: KEYS.map( ( [ left, wide, top, tall ] ) => [ ( left + wide / 2 - 0.5 ) * MM, ( 0.5 - top - tall / 2 ) * MM, ( wide * MM ) / 2, ( tall * MM ) / 2 ] ),
	glows: KEYS.flatMap( ( [ left, wide, top, , lampAt ], k ) =>
		lampAt ? [ [ ( ( lampAt === 'top' ? left + 0.5 * wide : left + 0.031 ) - 0.5 ) * MM, ( 0.5 - top + 0.0199 ) * MM, k ] ] : []
	),
};
// The pitch fader, where riff.css has it (.riff-pitch), in the record's width: its slot's middle
// across, its back and its front, the end stop at each, its cap's width and length, and the key
// that sends it back to its middle, its left, width, top and height. The page's range stands at the
// cap's ridged top, so a hand takes the cap where it is drawn.
const PITCH = { x: 1.135, back: 0.6, front: 0.92, stop: 0.01, wide: 0.054, long: 0.033, zero: [ 1.056, 0.038, 0.744, 0.032 ] };
const CAP_TOP = DECK_Z + 0.0092;
const LAMP_AT = [ -0.141, -0.141 ];
const LAMP = [ LAMP_AT[ 0 ] + 0.7071 * 0.022, LAMP_AT[ 1 ] + 0.7071 * 0.022, 0.006 ];
const TARGET = [ 0.51 * MM, -0.47 * MM ];
const ANTISKATE = [ 0.435 * MM, 0.52 * MM ];
const SHADOW = 2048;
// The eye: this far above the deck (radians), this far from where it looks (metres), which is a
// little behind the spindle; and the most of the stage's height the deck takes from there, the
// sleeve above it.
const SEAT = { rise: ( 20 * Math.PI ) / 180, away: 0.95, at: [ 0, 0.1, 0 ], room: 0.62 };
// The desk's back, against the wall; the ledge along it, its top; and half the sleeve's size.
const WALL = 0.33;
const LEDGE_Z = FLOOR_Z + 0.012;
const SL = 0.157;
// Where the sleeve stands: its foot behind the ledge's lip, leant back against the wall.
const SLEEVE_AT = chain( move( 0, WALL - 0.055, LEDGE_Z ), turnX( -0.12 ) );
// The most the canvas draws, in pixels: the whole of Now Playing on a large screen is many.
const MOST = 5e6;

// The light: a key from the upper left, low enough that a record seen from above does not mirror
// it, a cool rim from behind, a faint fill, and a strip for the grooves to catch.
const KEY = unit( [ -0.6, 0.5, 0.62 ] );
const RIM = unit( [ 0.55, 0.78, 0.3 ] );
const FILL = unit( [ 0.3, -0.8, 0.5 ] );
const STRIP = unit( [ -0.92, -0.1, 0.38 ] );
const v3 = ( v ) => `vec3(${ v.map( ( x ) => x.toFixed( 5 ) ).join( ', ' ) })`;
const f1 = ( x ) => x.toFixed( 5 );
const v2 = ( v ) => `vec2(${ f1( v[ 0 ] ) }, ${ f1( v[ 1 ] ) })`;

// Shading: GGX and Fresnel under the key, shadowed, and what a reflection sees, a dark room with
// three soft lights.
const COMMON = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
uniform sampler2DShadow uShadow; uniform highp sampler2D uDepth; uniform mat4 uLVP; uniform vec3 uEye, uHand; uniform vec4 uLamp, uSpot;
const vec3 L1 = ${ v3( KEY ) }, L2 = ${ v3( FILL ) }, L3 = ${ v3( RIM ) }, LS = ${ v3( STRIP ) };
const vec3 KEYC = vec3(2.5, 2.38, 2.2), RIMC = vec3(0.55, 0.62, 0.75), FILLC = vec3(0.11, 0.11, 0.125);
const vec3 LAMPC = vec3(1.0, 0.42, 0.14), LO = ${ v3( unit( [ 0.26, -0.2, 0.94 ] ) ) };
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float softbox(vec3 r, vec3 d, vec3 u, vec2 half_, float s) {
  float t = dot(r, d); if (t <= 0.02) return 0.0;
  u = normalize(u - d * dot(u, d)); vec3 w = cross(d, u), p = r / t - d;
  vec2 e = 1.0 - smoothstep(half_ - s, half_ + s, abs(vec2(dot(p, u), dot(p, w))));
  return e.x * e.y;
}
vec3 env(vec3 r, float rough) {
  float s = 0.02 + 0.9 * rough, k = 1.0 / (1.0 + 7.0 * rough * rough);
  vec3 c = vec3(0.010, 0.010, 0.013) + 0.022 * smoothstep(-0.3, 0.7, r.z);
  c += 7.0 * k * softbox(r, L1, vec3(1.0, 0.0, 0.0), vec2(0.55, 0.30), s) * vec3(1.0, 0.95, 0.88);
  c += 3.0 * k * softbox(r, LS, vec3(0.0, 1.0, 0.0), vec2(0.60, 0.07), s) * vec3(0.80, 0.88, 1.0);
  c += 4.0 * k * softbox(r, L3, vec3(0.0, 0.0, 1.0), vec2(0.34, 0.10), s) * vec3(0.85, 0.92, 1.0);
  // A panel overhead, a little to one side: what is round or rough catches it, and a record seen from above does not mirror it.
  c += 2.2 * k * softbox(r, LO, vec3(1.0, 0.0, 0.0), vec2(0.17, 0.10), s) * vec3(1.0, 0.97, 0.92);
  return c;
}
float shadow(vec3 P, vec3 N) {
  vec4 q = uLVP * vec4(P + N * 0.0012, 1.0); vec3 s = q.xyz / q.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  // A lamp is not a point: a shadow is crisp where a part meets what it stands on and softer the
  // further it falls, as the arm's is across the plate. What stands over this point, and how far
  // above it, on average; with nothing over it, it is lit, and the rest isn't asked.
  float b = 0.0, nb = 0.0, t = 1.0 / ${ SHADOW }.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float d = texture(uDepth, s.xy + vec2(float(i), float(j)) * 4.0 * t).r;
    if (d < s.z - 0.0009) { b += d; nb += 1.0; }
  }
  if (nb == 0.0) return 1.0;
  // The depth is 1.4 m deep; the lamp's breadth spreads a shadow about 6% of the way it falls.
  t *= clamp((s.z - b / nb) * 1.4 * 0.06 / ${ f1( 0.92 / SHADOW ) }, 0.6, 2.4);
  float a = 0.0;
  for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) a += texture(uShadow, vec3(s.xy + vec2(float(i), float(j)) * t, s.z - 0.0009));
  return a / 25.0;
}
float pool(vec3 P) { return mix(0.05, 1.0, 1.0 - smoothstep(0.20, 0.95, length(P.xy - vec2(0.04, 0.0)))); }
vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 F0, vec3 diff, float rough) {
  float nl = max(dot(N, L), 0.0); if (nl <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V); float nh = max(dot(N, H), 0.0), nv = max(dot(N, V), 1e-3), a = rough * rough, a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0, D = min(a2 / (3.14159 * d * d), 40.0), k = (rough + 1.0) * (rough + 1.0) / 8.0;
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  return (diff + D * F / (4.0 * (nl * (1.0 - k) + k) * (nv * (1.0 - k) + k))) * nl;
}
vec3 shade(vec3 P, vec3 N, vec3 alb, float rough, float metal, float ao) {
  vec3 V = normalize(uEye - P), F0 = mix(vec3(0.04), alb, metal), diff = alb * (1.0 - metal);
  float sh = shadow(P, N), nv = max(dot(N, V), 1e-3);
  // Where one part meets another little of the lamp's breadth reaches in either: a contact's shade
  // (ao) takes from the key light too, not only from the room.
  vec3 c = brdf(N, V, L1, F0, diff, rough) * KEYC * sh * pool(P) * mix(1.0, ao, 0.6) +brdf(N, V, L3, F0, diff, rough) * RIMC * ao + brdf(N, V, L2, F0, diff, rough) * FILLC;
  vec3 lp = uLamp.xyz - P; float ld = length(lp);
  c += brdf(N, V, lp / ld, F0, diff, max(rough, 0.3)) * LAMPC * uLamp.w * 1.6 / (1.0 + ld * ld / 0.0012);
  // A hand over the deck is a little light of its own: what it nears catches it.
  vec3 hp = vec3(uHand.xy, 0.05) - P; float hd = length(hp);
  c += brdf(N, V, hp / hd, F0, diff, max(rough, 0.28)) * vec3(1.0, 0.96, 0.9) * uHand.z * 0.55 / (1.0 + hd * hd / 0.0035);
  // The target light by the platter, which is there to see the stylus by: a small warm pool, thrown
  // toward the record rather than all round, as its lens points it.
  vec3 tp = uSpot.xyz - P; float td = length(tp), aim = 0.35 + 0.65 * max(dot(normalize(-uSpot.xy), -tp.xy / max(length(tp.xy), 1e-4)), 0.0);
  c += brdf(N, V, tp / td, F0, diff, max(rough, 0.3)) * vec3(1.0, 0.93, 0.8) * uSpot.w * 0.8 * aim / (1.0 + td * td / 0.0025);
  vec3 F = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - nv, 5.0);
  return c + env(reflect(-V, N), rough) * F * ao * (0.45 + 0.55 * sh) + diff * 0.015 * ao;
}
vec3 tone(vec3 x) {
  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return pow(x, vec3(1.0 / 2.2)) + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

const STD_VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN;
uniform mat4 uVP, uM; out vec3 vP, vN, vO;
void main() { vec4 w = uM * vec4(aP, 1.0); vP = w.xyz; vN = mat3(uM) * aN; vO = aP; gl_Position = uVP * w; }`;

const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

// uMode: 0 plain, 1 turned metal, 2 the deck's plate, 3 the platter and its strobe, 6 a key's cap, 7 a lamp's lens, 8 the
// standing sleeve, its face the cover (uCover, where it could be read), 5 the desk, which is only the shadows on it: the page
// shows through everywhere else, and beyond the desk's back the page is the wall.
const STD_FS =
	COMMON +
	`
in vec3 vP, vN, vO; out vec4 o;
uniform mat4 uM; uniform vec3 uCol, uEmis; uniform float uRough, uMetal, uAlpha, uBlur; uniform int uMode; uniform vec2 uPivot, uStrobe; uniform vec4 uBody, uKey; uniform vec3 uTint, uGlowAt[5]; uniform float uCoverOn; uniform sampler2D uCover; uniform vec4 uCaps[7];
const float RP = ${ f1( PLATTER ) };
float row(float a, float r, float n, float rr, float px) {
  vec2 c = vec2((fract(a / 6.2831853 * n) - 0.5) * 6.2831853 * rr / n, r - rr);
  return 1.0 - smoothstep(0.0006, 0.0008 + px, length(c));
}
float ring(float r, float rr, float px) { return 0.36 * (1.0 - smoothstep(0.0005, 0.0008 + px, abs(r - rr))); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 N = normalize(vN), alb = uCol; float rough = uRough, metal = uMetal, ao = 1.0, lit = 0.0;
  float ro = length(vO.xy), px = fwidth(vO.x) + fwidth(vO.y) + fwidth(vO.z);
  if (uMode == 5) {
    vec2 q = abs(vP.xy - uBody.xy) - uBody.zw;
    float near = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float a = 0.5 * (1.0 - shadow(vP, vec3(0.0, 0.0, 1.0))) + 0.4 * (1.0 - smoothstep(0.0, 0.035, near));
    // The light falls round the deck and gives out toward the desk's edges.
    float far = length(vP.xy - vec2(0.03, 0.0));
    a = min(a, 0.85); a += (1.0 - a) * 0.5 * smoothstep(0.42, 1.25, far);
    // Darker in the corner where the desk meets the wall, and under the ledge.
    a += (1.0 - a) * 0.45 * (1.0 - smoothstep(0.0, 0.06, ${ f1( WALL ) } - vP.y));
    a = clamp(a + (hash(gl_FragCoord.xy) - 0.5) / 255.0, 0.0, 1.0);
    // The light is a pale veil over the shadows, never brighter than it is opaque: a compositor
    // clamps a colour with more light in it than its alpha allows.
    float k = 0.05 * (1.0 - smoothstep(0.05, 0.8, far)) * (1.0 - a);
    o = vec4(vec3(1.0, 0.94, 0.86) * k, k + (1.0 - k) * a) * uAlpha; return;
  }
  if (uMode == 8) {
    // The sleeve, standing: its face the cover, lit by the room in front of it, a little darker
    // toward the ledge and away from the lamp, shaded where the lip holds its foot; its edges card.
    vec3 face = uCol;
    if (N.y < -0.5 && uCoverOn > 0.5) { vec3 t = texture(uCover, vec2(vO.x / ${ f1( 2 * SL ) } + 0.5, 1.0 - vO.z / ${ f1( 2 * SL ) })).rgb; face = t * t; }
    float room = (0.55 + 0.3 * smoothstep(0.0, 0.18, vO.z)) * (1.0 - 0.1 * smoothstep(${ f1( -SL ) }, ${ f1( SL ) }, vO.x)) * mix(0.7, 1.0, smoothstep(0.0, 0.012, vO.z));
    vec3 c = face * room * vec3(1.0, 0.95, 0.88) * (N.y < -0.5 ? 1.0 : 0.5);
    o = vec4(clamp(tone(c), 0.0, 1.0) * uAlpha, uAlpha); return;
  }
  if (uMode == 1 || uMode == 3) {
    // Turned round its own middle (uKey.xy for a part that stands off the spindle), and where uKey.z
    // says so, a knob's skirt: fluted that many times round, the flutes catching the light in turn.
    vec2 q = uMode == 1 ? vO.xy - uKey.xy : vO.xy; float rq = max(length(q), 1e-4), flutes = uMode == 1 ? uKey.z : 0.0;
    float b = hash(vec2(floor(rq * 5000.0), 3.0)) - 0.5, fade = 1.0 - smoothstep(1e-4, 6e-4, px);
    if (abs(N.z) > (flutes > 0.0 ? 0.95 : 0.5)) { N = normalize(N + mat3(uM) * vec3(q / rq, 0.0) * b * 0.10 * fade); rough += b * 0.10 * fade; }
    else if (flutes > 0.0) {
      float f = sin(atan(q.y, q.x) * flutes) * smoothstep(2.0, 4.0, 6.2832 * rq / flutes / max(px, 1e-6));
      N = normalize(N + mat3(uM) * vec3(-q.y, q.x, 0.0) / rq * f * 0.45); rough -= 0.06 * f;
    }
  }
  if (uMode == 3 && ro > RP - 0.0108 && N.z > 0.5) {
    float r1 = 0.957 * RP, r2 = 0.979 * RP, a = atan(vO.y, vO.x), aw = atan(vP.y, vP.x);
    float still = max(row(a, ro, 216.0, r1, px), row(a, ro, 160.0, r2, px));
    float d = mix(still, max(ring(ro, r1, px), ring(ro, r2, px)), uBlur);
    alb = mix(vec3(0.012), vec3(0.11), d); rough = 0.5; metal = 0.0;
    lit = max(row(aw + uStrobe.x, ro, 216.0, r1, px), row(aw + uStrobe.y, ro, 160.0, r2, px));
  }
  // The platter's rim, turned and polished where it rounds over: a thin line of the room's light.
  if (uMode == 3 && N.z > 0.3 && N.z < 0.9) rough = 0.16;
  if (uMode == 6 && N.z > 0.5) {
    // Moulded, as a key's cap is: dished a little toward its middle, so the light lies across it and
    // moves as the key leans, and matt with the mould's fine grain.
    float grain = (hash(floor(vO.xy * 9000.0)) - 0.5) * (1.0 - smoothstep(1.5e-4, 6e-4, px));
    N = normalize(N + mat3(uM) * vec3((uKey.xy - vO.xy) / uKey.zw * 0.1, 0.0));
    alb *= 1.0 + 0.16 * grain; rough += 0.12 * grain;
  }
  // A cap's bevel, worn smoother than its face by fingers: it catches the light along its edge.
  if (uMode == 6 && N.z > 0.15 && N.z <= 0.5) rough = 0.22;
  vec3 em = uEmis;
  if (uMode == 7) {
    // A lamp's lens, lit: hottest, and a little whiter, at its middle, its amber toward its ends.
    vec2 q = (vO.xy - uKey.xy) / uKey.zw; float core = exp(-dot(q, q) * 1.6);
    em = uEmis * (0.6 + 0.7 * core) + vec3(0.0, 0.16, 0.08) * uEmis.r * core * core;
  }
  if (uMode == 2) alb = mix(alb, uTint, 0.08);
  if (uMode == 2 && N.z > 0.5) {
    // Brushed, as an aluminium top plate is: fine lines along it, each a little lighter or darker
    // and a little smoother or rougher than the next.
    float brush = (hash(vec2(floor(vP.y * 6500.0), floor(vP.x * 19.0))) - 0.5) * (1.0 - smoothstep(1.5e-4, 7e-4, px));
    alb *= 1.0 + 0.2 * brush; rough += 0.1 * brush;
    alb *= 0.88 + 0.24 * hash(floor(vP.xy * 2500.0)) * (1.0 - smoothstep(2e-4, 1e-3, px));
    // A plate that has been used: broad, faint unevenness in its sheen, seen only where the lamp
    // lies across it.
    float worn = 0.6 * vnoise(vP.xy * 17.0) + 0.4 * vnoise(vP.xy * 53.0 + 7.0) - 0.5;
    rough += 0.16 * worn; alb *= 1.0 + 0.08 * worn;
    // Round each key, where it stands in its well, the plate sees less of the room.
    for (int i = 0; i < 7; i++) {
      vec2 k = abs(vP.xy - uCaps[i].xy) - uCaps[i].zw;
      ao *= mix(0.5, 1.0, smoothstep(0.0008, 0.005, length(max(k, 0.0)) + min(max(k.x, k.y), 0.0)));
    }
    ao *= mix(0.35, 1.0, smoothstep(RP - 0.001, RP + 0.04, length(vP.xy))) * mix(0.45, 1.0, smoothstep(0.02, 0.05, length(vP.xy - uPivot)));
    // Where the strobe's lamp, the target light and the anti-skate dial stand on it, a tight dark
    // ring at the foot of each, as the plate sees less of the room there.
    ao *= mix(0.4, 1.0, smoothstep(0.017, 0.024, length(vP.xy - ${ v2( LAMP_AT ) })));
    ao *= mix(0.45, 1.0, smoothstep(0.0075, 0.012, length(vP.xy - ${ v2( TARGET ) })));
    ao *= mix(0.45, 1.0, smoothstep(0.0105, 0.016, length(vP.xy - ${ v2( ANTISKATE ) })));
  }
  vec3 c = shade(vP, N, alb, clamp(rough, 0.06, 1.0), metal, ao) + em;
  // Each lit lamp spills a little of its amber on what is round it.
  for (int i = 0; i < 5; i++) { vec2 g = vP.xy - uGlowAt[i].xy; c += vec3(1.0, 0.46, 0.12) * uGlowAt[i].z * 0.05 * step(vP.z, 0.0) / (1.0 + dot(g, g) / 0.00003); }
  vec3 lp = uLamp.xyz - vP;
  c += LAMPC * lit * uLamp.w * 1.1 / (1.0 + dot(lp, lp) / 0.0012);
  o = vec4(clamp(tone(c), 0.0, 1.0) * uAlpha, uAlpha);
}`;

const REC_VS = `#version 300 es
layout(location=0) in vec3 aP;
uniform mat4 uVP, uM; out vec3 vP; out vec2 vQ;
void main() { vec4 w = uM * vec4(aP, 1.0); vP = w.xyz; vQ = aP.xy; gl_Position = uVP * w; }`;

// The record. uZone is its cut, in metres from the middle: the hole, the label's edge, the last
// groove and the first. uLabel is the label and the dead wax round it, out to the last groove;
// uBands is the side from the last groove out to the first, nothing where a gap between two tracks
// is and otherwise how hard the groove there is cut.
const REC_FS =
	COMMON +
	`
in vec3 vP; in vec2 vQ; out vec4 o;
uniform mat4 uM; uniform sampler2D uLabel, uBands; uniform vec4 uZone; uniform float uAlpha, uCue, uNow, uGlow;
void main() {
  float r = length(vQ), phi = atan(vQ.y, vQ.x);
  if (r < uZone.x) discard;
  // No pressing is flat: this one is dished a hair and rises twice round, half a millimetre at the
  // rim, so as it turns the light on it sways, as it does on a record.
  float w = r / ${ f1( R ) }, c1 = cos(phi - 0.7), s1 = sin(phi - 0.7), c2 = cos(2.0 * phi + 1.9), s2 = sin(2.0 * phi + 1.9);
  float dzr = (2.0 * 0.0004 * w * c1 + 3.0 * 0.00018 * w * w * c2) / ${ f1( R ) };
  float dzt = (-0.0004 * w * w * s1 - 2.0 * 0.00018 * w * w * w * s2) / max(r, 0.01);
  vec2 er = vec2(cos(phi), sin(phi)), et = vec2(-er.y, er.x);
  vec3 N = normalize(mat3(uM) * vec3(-dzr * er - dzt * et, 1.0)), V = normalize(uEye - vP);
  vec3 Tw = normalize(mat3(uM) * vec3(et, dzt));
  float px = fwidth(vQ.x) + fwidth(vQ.y), sh = shadow(vP, N), key = sh * pool(vP);
  vec4 tex = texture(uLabel, vQ / (2.0 * uZone.z) + 0.5);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 land = vec3(0.0012) + env(reflect(-V, N), 0.07) * (0.045 + 0.955 * fr) * (0.5 + 0.5 * sh) + brdf(N, V, L1, vec3(0.045), vec3(0.002), 0.12) * KEYC * key;
  float t = (r - uZone.z) / (uZone.w - uZone.z), band = texture(uBands, vec2(clamp(t, 0.0, 1.0), 0.5)).r;
  float vis = max(0.0, band * 255.0 - 1.0) / 254.0;
  float cover = 0.62 * smoothstep(0.0, 0.06, band) * smoothstep(uZone.z - px, uZone.z + px, r) * (1.0 - smoothstep(uZone.w - px, uZone.w + px, r));
  // The groove's walls, a fan of mirrors at 45 degrees: streaks across the tracks, wider where it is cut hard.
  float sig = 0.014 + 0.085 * vis; vec3 groove = vec3(0.0016) + vis * 0.003;
  for (int i = 0; i < 3; i++) {
    vec3 L = i == 0 ? L1 : (i == 1 ? L3 : LS), H = normalize(L + V);
    vec3 lc = i == 0 ? KEYC * key : (i == 1 ? RIMC * 1.6 : vec3(0.5, 0.56, 0.66));
    float th = dot(Tw, H), s = exp(-th * th / (2.0 * sig * sig)) * 0.0085 / sig * (0.3 + 0.7 * max(dot(N, H), 0.0));
    groove += s * lc * (vec3(0.86, 0.85, 0.83) + 0.07 * cos(6.2832 * (th * 9.0 + r * 55.0 + vec3(0.0, 0.33, 0.67))));
  }
  // What only a drawn record can do: it shows where the music is. The grooves still to be played lie
  // a little quieter than those the stylus has been through, so the side reads as a clock does, and
  // the groove under the stylus carries a soft light that rises and falls with the music's level.
  float going = step(1e-5, uNow), ahead = going * (1.0 - smoothstep(uNow - 0.0005, uNow + 0.0005, r));
  groove *= 1.0 - 0.2 * ahead;
  vec3 c = mix(land, groove, cover);
  float off = (r - uNow) / 0.0016;
  c += vec3(1.0, 0.9, 0.76) * 0.085 * uGlow * going * exp(-off * off) * smoothstep(0.0, 0.06, band);
  // Dust, which every record that has left its sleeve carries: a few specks, seen where the light falls.
  vec2 cell = vQ * 1300.0, at = floor(cell);
  float speck = step(0.9986, hash(at)) * (1.0 - smoothstep(0.12, 0.3, length(fract(cell) - 0.3 - 0.4 * vec2(hash(at + 7.0), hash(at + 13.0)))));
  c += vec3(0.9, 0.88, 0.84) * 0.04 * speck * key * step(uZone.y, r);
  // The matrix number, scratched into the dead wax.
  c += tex.a * 0.02 * (0.4 + key) * step(uZone.y + 0.001, r);
  // The groove a pointer or the arm in the hand is at: a hair of light round the side.
  c += vec3(1.0, 0.93, 0.82) * 0.11 * step(1e-5, uCue) * (1.0 - smoothstep(0.0002, 0.0005 + px, abs(r - uCue)));
  // Paper, with its grain.
  vec3 paper = shade(vP, N, tex.rgb * tex.rgb * 0.5 * (0.95 + 0.1 * hash(floor(vQ * 9000.0))), 0.75, 0.0, 1.0);
  c = mix(paper, c, smoothstep(uZone.y - px, uZone.y + px, r));
  o = vec4(clamp(tone(c), 0.0, 1.0) * uAlpha, uAlpha);
}`;

export default function deckGl( P ) {
	const { root, np, $ } = P;
	const stage = $( '.riff-stage' );
	const plinth = $( '.riff-plinth' );
	const record = stage?.querySelector( ':scope > .riff-record' );
	const arm = $( '.riff-arm' );
	const wand = $( '.riff-arm-tube' );
	const wax = $( '.riff-wax' );
	const label = $( '.riff-label' );
	if ( ! stage || ! plinth || ! record || ! arm || ! wand || ! wax || ! label || ! P.arm ) {
		P.drawable?.( false );
		return null;
	}
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'riff-deck-gl';
	canvas.setAttribute( 'aria-hidden', 'true' );
	// Only where a graphics card draws it: drawn in software it would cost the music's own thread.
	const gl = canvas.getContext( 'webgl2', {
		antialias: true,
		alpha: true,
		premultipliedAlpha: true,
		preserveDrawingBuffer: true,
		failIfMajorPerformanceCaveat: true,
	} );
	// Some browsers hand out a software one all the same, and say so in its name.
	const names = gl?.getExtension( 'WEBGL_debug_renderer_info' );
	if ( ! gl || ( names && /swiftshader|llvmpipe|software|basic render/i.test( gl.getParameter( names.UNMASKED_RENDERER_WEBGL ) ) ) ) {
		P.drawable?.( false );
		return null;
	}
	// Under everything Now Playing shows, over its background's washes.
	( $( '.riff-np-bg' ) || stage ).append( canvas );
	const cover = $( '.riff-cover' );
	// The deck's keys (player.php): drawn where they show, each a little lower while it is pressed.
	const keys = [ ...stage.querySelectorAll( '.riff-keys button:not([data-riff-reset])' ) ];

	// The arm, as now-playing.js set it up: its base in the record's width, its length, and its
	// headshell's angle.
	const PIVOT = [ ( P.arm.base[ 0 ] - 0.5 ) * MM, ( 0.5 - P.arm.base[ 1 ] ) * MM ];
	const LE = P.arm.length * MM;
	const BETA = P.arm.offset;
	const REST = ( -Math.PI / 2 ) - ( P.arm.rest * Math.PI ) / 180;
	// The tube, in the arm's own frame, +x from the base to the stylus: the page's own path (its
	// drawing's hundredths of the record), sinking from the base's height to the headshell's.
	const U = MM / 100;
	const back = ( k ) => [ LE - k * U * Math.cos( BETA ), k * U * Math.sin( BETA ) ];
	const END = back( 13.25 );
	const TUBE = [
		...bezier( [ 0, 0 ], [ 24 * U, 0 ], [ 42 * U, 2.6 * U ], [ 55 * U, 2.2 * U ] ),
		...bezier( [ 55 * U, 2.2 * U ], [ 60 * U, 2.05 * U ], back( 17.5 ), END ).slice( 1 ),
	].map( ( [ x, y ] ) => [ x, y, ( -0.0125 * x ) / END[ 0 ] ] );
	const REST_PT = TUBE[ 22 ];
	const restAt = [
		PIVOT[ 0 ] + REST_PT[ 0 ] * Math.cos( REST ) - REST_PT[ 1 ] * Math.sin( REST ),
		PIVOT[ 1 ] + REST_PT[ 0 ] * Math.sin( REST ) + REST_PT[ 1 ] * Math.cos( REST ),
	];
	// How high the stylus rides above the record with the cue lever up, and on the rest.
	const UP = 0.007;
	const restZ = PIVOT_H + REST_PT[ 2 ] + ( UP * REST_PT[ 0 ] ) / LE - 0.0042;

	let m, tex, std, rec, dep, fbo, lvp, raw;
	function mesh( data ) {
		const vao = gl.createVertexArray();
		gl.bindVertexArray( vao );
		gl.bindBuffer( gl.ARRAY_BUFFER, gl.createBuffer() );
		gl.bufferData( gl.ARRAY_BUFFER, data, gl.STATIC_DRAW );
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 3, gl.FLOAT, false, 24, 0 );
		gl.enableVertexAttribArray( 1 );
		gl.vertexAttribPointer( 1, 3, gl.FLOAT, false, 24, 12 );
		gl.bindVertexArray( null );
		return { vao, count: data.length / 6 };
	}
	// Each question put to the context waits for the graphics process to answer it, and while a
	// shader compiles that is the time it takes: only the link is asked about, once, and the
	// shaders' own logs only when it failed.
	function program( vs, fs ) {
		const p = gl.createProgram();
		const shaders = [ [ gl.VERTEX_SHADER, vs ], [ gl.FRAGMENT_SHADER, fs ] ].map( ( [ type, src ] ) => {
			const s = gl.createShader( type );
			gl.shaderSource( s, src );
			gl.compileShader( s );
			gl.attachShader( p, s );
			return s;
		} );
		gl.bindAttribLocation( p, 0, 'aP' );
		gl.bindAttribLocation( p, 1, 'aN' );
		gl.linkProgram( p );
		if ( ! gl.getProgramParameter( p, gl.LINK_STATUS ) ) {
			throw new Error( shaders.map( ( s ) => gl.getShaderInfoLog( s ) ).join( '' ) || gl.getProgramInfoLog( p ) );
		}
		const u = {};
		const count = gl.getProgramParameter( p, gl.ACTIVE_UNIFORMS );
		for ( let i = 0; i < count; i++ ) {
			const name = gl.getActiveUniform( p, i ).name.replace( /\[0\]$/, '' );
			u[ name ] = gl.getUniformLocation( p, name );
		}
		return { p, u };
	}
	const texture = ( filter ) => {
		const t = gl.createTexture();
		gl.bindTexture( gl.TEXTURE_2D, t );
		for ( const [ p, v ] of [ [ gl.TEXTURE_MIN_FILTER, filter ], [ gl.TEXTURE_MAG_FILTER, gl.LINEAR ], [ gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE ], [ gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ] ] ) {
			gl.texParameteri( gl.TEXTURE_2D, p, v );
		}
		return t;
	};

	// The plinth with its keys, the keys, the well each key stands in, a dark gap round it, and each
	// key's lamp on the plinth behind it, clear of the cap from a chair: behind the left of start's,
	// the middle of shuffle's and repeat's (riff.css's lamps are along their tops).
	function keyedMeshes( { body: [ x0, y0, x1, y1 ], keys: set } ) {
		return {
			body: mesh( rbox( x0, y0, x1, y1, FLOOR_Z, -0.03, 0.012, 0.002 ) ),
			plate: mesh( rbox( x0 + 0.002, y0 + 0.002, x1 - 0.002, y1 - 0.002, -0.03, DECK_Z, 0.01, 0.0018 ) ),
			keys: set.map( ( [ left, wide, top, tall ] ) =>
				mesh( rbox( ( left - 0.5 ) * MM, ( 0.5 - top - tall ) * MM, ( left + wide - 0.5 ) * MM, ( 0.5 - top ) * MM, DECK_Z - 0.002, DECK_Z + 0.003, 0.0022, 0.0009 ) )
			),
			wells: mesh(
				merge(
					...set.map( ( [ left, wide, top, tall ] ) =>
						rbox( ( left - 0.5 ) * MM - 0.0012, ( 0.5 - top - tall ) * MM - 0.0012, ( left + wide - 0.5 ) * MM + 0.0012, ( 0.5 - top ) * MM + 0.0012, DECK_Z - 0.001, DECK_Z + 0.0003, 0.003, 0.0002 )
					)
				)
			),
			lamps: set.map( ( [ left, wide, top, , lampAt ] ) => {
				if ( ! lampAt ) {
					return null;
				}
				const [ from, to ] = lampAt === 'top' ? [ left + 0.35 * wide, left + 0.65 * wide ] : [ left + 0.016, left + 0.046 ];
				const [ lx0, ly0, lx1, ly1 ] = [ ( from - 0.5 ) * MM, ( 0.5 - top + 0.0166 ) * MM, ( to - 0.5 ) * MM, ( 0.5 - top + 0.0232 ) * MM ];
				// With its middle and half its size, for the core of its light (STD_FS, mode 7).
				return { ...mesh( rbox( lx0, ly0, lx1, ly1, DECK_Z - 0.0002, DECK_Z + 0.0012, 0.0006, 0.0002 ) ), at: [ ( lx0 + lx1 ) / 2, ( ly0 + ly1 ) / 2, ( lx1 - lx0 ) / 2, ( ly1 - ly0 ) / 2 ] };
			} ),
		};
	}

	// The pitch fader: a slot let into the plinth between two raised rails that catch the lamp along
	// their bevels, closed by an end stop at each end, its floor dark with the slit the cap's stem
	// rides in; the cap, in its own frame, its middle at the origin, standing on its stem above the
	// rails, bevelled, with four ridges across its top for a finger and a white line between them
	// that is read against the scale; and the key by its zero, in its well, with its lamp.
	function pitchMeshes() {
		const [ x, y0, y1, stop ] = [ ( PITCH.x - 0.5 ) * MM, ( 0.5 - PITCH.front ) * MM, ( 0.5 - PITCH.back ) * MM, PITCH.stop * MM ];
		const [ inner, rail, top ] = [ 0.0024, 0.0026, DECK_Z + 0.002 ];
		const [ cw, cl ] = [ ( PITCH.wide * MM ) / 2, ( PITCH.long * MM ) / 2 ];
		const [ left, wide, kt, tall ] = PITCH.zero;
		const [ kx0, ky0, kx1, ky1 ] = [ ( left - 0.5 ) * MM, ( 0.5 - kt - tall ) * MM, ( left + wide - 0.5 ) * MM, ( 0.5 - kt ) * MM ];
		const [ lx0, ly0, lx1, ly1 ] = [ ( left + 0.35 * wide - 0.5 ) * MM, ( 0.5 - kt + 0.0166 ) * MM, ( left + 0.65 * wide - 0.5 ) * MM, ( 0.5 - kt + 0.0232 ) * MM ];
		return {
			rails: mesh(
				merge(
					rbox( x - inner - rail, y0, x - inner, y1, DECK_Z - 0.001, top, 0.0009, 0.0006 ),
					rbox( x + inner, y0, x + inner + rail, y1, DECK_Z - 0.001, top, 0.0009, 0.0006 ),
					rbox( x - inner - 0.0004, y0, x + inner + 0.0004, y0 + stop, DECK_Z - 0.001, top, 0.0006, 0.0006 ),
					rbox( x - inner - 0.0004, y1 - stop, x + inner + 0.0004, y1, DECK_Z - 0.001, top, 0.0006, 0.0006 )
				)
			),
			floor: mesh( box( x - inner, y0 + stop, DECK_Z - 0.001, x + inner, y1 - stop, DECK_Z + 0.0003 ) ),
			slit: mesh( box( x - 0.0007, y0 + stop + 0.0012, DECK_Z - 0.001, x + 0.0007, y1 - stop - 0.0012, DECK_Z + 0.00035 ) ),
			cap: mesh(
				merge(
					box( -0.0007, -0.0025, DECK_Z - 0.0006, 0.0007, 0.0025, DECK_Z + 0.0034 ),
					rbox( -cw, -cl, cw, cl, DECK_Z + 0.003, CAP_TOP - 0.0007, 0.0014, 0.0009 ),
					...[ -0.0036, -0.0018, 0.0018, 0.0036 ].map( ( r ) => rbox( 0.0007 - cw, r - 0.00045, cw - 0.0007, r + 0.00045, CAP_TOP - 0.0009, CAP_TOP, 0.0003, 0.00025, 3 ) )
				)
			),
			line: mesh( box( 0.0009 - cw, -0.0003, CAP_TOP - 0.0009, cw - 0.0009, 0.0003, CAP_TOP - 0.00064 ) ),
			key: { ...mesh( rbox( kx0, ky0, kx1, ky1, DECK_Z - 0.002, DECK_Z + 0.003, 0.0022, 0.0009 ) ), at: [ ( kx0 + kx1 ) / 2, ( ky0 + ky1 ) / 2, ( kx1 - kx0 ) / 2, ( ky1 - ky0 ) / 2 ] },
			well: mesh( rbox( kx0 - 0.0012, ky0 - 0.0012, kx1 + 0.0012, ky1 + 0.0012, DECK_Z - 0.001, DECK_Z + 0.0003, 0.003, 0.0002 ) ),
			lamp: { ...mesh( rbox( lx0, ly0, lx1, ly1, DECK_Z - 0.0002, DECK_Z + 0.0012, 0.0006, 0.0002 ) ), at: [ ( lx0 + lx1 ) / 2, ( ly0 + ly1 ) / 2, ( lx1 - lx0 ) / 2, ( ly1 - ly0 ) / 2 ] },
		};
	}

	// Everything the context holds, made again if the context is lost and comes back.
	function build() {
		std = program( STD_VS, STD_FS );
		rec = program( REC_VS, REC_FS );
		dep = program( STD_VS, DEPTH_FS );
		const L = lathe;
		const [ x0, y0, x1, y1 ] = BODY;
		const RP = PLATTER;
		m = {
			desk: mesh( box( -2, -2, FLOOR_Z - 0.02, 2, WALL, FLOOR_Z ) ),
			// Along the desk's back, the ledge, with a lip at its front the sleeve stands behind.
			// The lip low, 5 mm, so it holds the sleeve's foot without crossing what is printed there.
			ledge: mesh( merge( box( -0.2, WALL - 0.07, FLOOR_Z, 0.2, WALL, LEDGE_Z ), box( -0.2, WALL - 0.07, LEDGE_Z, 0.2, WALL - 0.064, LEDGE_Z + 0.005 ) ) ),
			// In its own frame: its foot's middle at the origin, its face toward -y.
			sleeve: mesh( box( -SL, -0.0015, 0, SL, 0.0015, 2 * SL ) ),
			body: mesh( rbox( x0, y0, x1, y1, FLOOR_Z, -0.03, 0.012, 0.002 ) ),
			plate: mesh( rbox( x0 + 0.002, y0 + 0.002, x1 - 0.002, y1 - 0.002, -0.03, DECK_Z, 0.01, 0.0018 ) ),
			// The same with its keys.
			keyed: keyedMeshes( DECK ),
			pitch: pitchMeshes(),
			platter: mesh( L( [ [ 0, -0.0215 ], [ RP - 0.0005, -0.0215 ], [ RP, -0.0205 ], [ RP, -0.0072 ], [ RP - 0.002, -0.0045 ], [ RP - 0.011, -0.0036 ], [ RP - 0.011, -0.0025 ], [ 0, -0.0025 ] ], 160 ) ),
			mat: mesh( L( [ [ RP - 0.013, -0.0025 ], [ RP - 0.013, -0.0013 ], [ 0, -0.0013 ] ], 96 ) ),
			spindle: mesh( L( [ [ 0.0036, -0.003 ], [ 0.0036, 0.009 ], [ 0.003, 0.0108 ], [ 0.0015, 0.0115 ], [ 0, 0.0115 ] ], 24 ) ),
			edge: mesh( cyl( R, R, -0.0013, 0, 128, false ) ),
			disc: mesh( annulus( 0.0036, R ) ),
			// The strobe's lamp, a knob with a wide bevel round its top for the light to catch.
			lamp: mesh( merge( at( L( [ [ 0.017, DECK_Z ], [ 0.017, 0.001 ], [ 0.0145, 0.0035 ], [ 0, 0.0035 ] ], 64 ), ...LAMP_AT ) ) ),
			// The strobe's lens, a window let into the bevel of its lamp, facing the platter's rim.
			lens: mesh( box( -0.001, -0.0045, -0.004, 0.0008, 0.0045, 0.003 ) ),
			target: mesh( merge( at( L( [ [ 0.0075, DECK_Z ], [ 0.0075, -0.009 ], [ 0.0065, -0.008 ], [ 0, -0.008 ] ], 28 ), ...TARGET ) ) ),
			targetLamp: mesh( merge( at( L( [ [ 0.003, -0.008 ], [ 0.003, -0.0074 ], [ 0, -0.0074 ] ], 16 ), ...TARGET ) ) ),
			antiskate: mesh( merge( at( L( [ [ 0.0105, DECK_Z ], [ 0.0105, -0.013 ], [ 0.0095, -0.012 ], [ 0, -0.012 ] ], 36 ), ...ANTISKATE ) ) ),
			pointer: mesh( merge( at( alongX( cyl( 0.0005, 0.0005, 0.002, 0.0085, 8 ) ), 0, 0, -0.0117 ) ) ),
			tower: mesh(
				merge(
					at( L( [ [ 0.024, DECK_Z ], [ 0.024, -0.0195 ], [ 0.022, -0.018 ], [ 0.015, -0.018 ], [ 0.015, 0.008 ], [ 0.013, 0.01 ], [ 0.013, 0.045 ], [ 0.012, 0.0465 ], [ 0, 0.0465 ] ], 48 ), ...PIVOT ),
					at( L( [ [ 0.0035, DECK_Z ], [ 0.0035, restZ - 0.003 ], [ 0.007, restZ - 0.003 ], [ 0.007, restZ ], [ 0, restZ ] ], 20 ), ...restAt )
				)
			),
			towerCap: mesh( merge( at( L( [ [ 0.0085, 0.0466 ], [ 0.0085, 0.0476 ], [ 0, 0.0476 ] ], 32 ), ...PIVOT ) ) ),
			// In the arm's frame.
			tube: mesh( merge( tube( TUBE, 0.0038, 20 ), alongX( cyl( 0.0045, 0.0045, -0.021, 0.002, 24 ) ) ) ),
			weight: mesh( alongX( L( [ [ 0, -0.042 ], [ 0.0098, -0.042 ], [ 0.0105, -0.0408 ], [ 0.0105, -0.0222 ], [ 0.0098, -0.021 ], [ 0, -0.021 ] ], 40 ) ) ),
			dial: mesh( alongX( L( [ [ 0.0085, -0.021 ], [ 0.0085, -0.017 ], [ 0.0078, -0.016 ], [ 0, -0.016 ] ], 40 ) ) ),
			// In the headshell's frame, +x the way the groove runs, the stylus's tip at z = -PIVOT_H.
			collar: mesh(
				merge(
					at( alongX( L( [ [ 0.0042, -0.047 ], [ 0.006, -0.047 ], [ 0.006, -0.036 ], [ 0.0042, -0.036 ] ], 24 ) ), 0, 0, -0.0125 ),
					at( cyl( 0.0014, 0.0014, -0.0122, -0.0116, 10 ), -0.012, 0.0045 ),
					at( cyl( 0.0014, 0.0014, -0.0122, -0.0116, 10 ), -0.012, -0.0045 ),
					tube( [ [ -0.0045, 0, -0.027 ], [ 0, 0, -0.0297 ] ], 0.00035, 8 ),
					cyl( 0.00004, 0.0004, -0.03, -0.0296, 8 )
				)
			),
			shell: mesh(
				merge(
					rbox( -0.037, -0.0095, 0.012, 0.0095, -0.0142, -0.0122, 0.003, 0.0005 ),
					tube( [ [ -0.002, 0.009, -0.0132 ], [ -0.001, 0.016, -0.013 ], [ 0, 0.021, -0.0112 ], [ 0.0005, 0.024, -0.007 ] ], 0.0012, 10 ),
					box( -0.0225, -0.0068, -0.0246, 0.0035, 0.0068, -0.0142 )
				)
			),
			holder: mesh( box( -0.0075, -0.0052, -0.0272, 0.005, 0.0052, -0.0246 ) ),
		};
		tex = {
			label: texture( gl.LINEAR_MIPMAP_LINEAR ),
			leaving: null,
			bands: texture( gl.LINEAR ),
			shadow: texture( gl.LINEAR ),
			cover: texture( gl.LINEAR_MIPMAP_LINEAR ),
		};
		covered = '';
		coverOn = 0;
		gl.bindTexture( gl.TEXTURE_2D, tex.shadow );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL );
		// The same depths read as they are, for how far above a point what shades it is (COMMON, shadow()).
		raw = gl.createSampler();
		gl.samplerParameteri( raw, gl.TEXTURE_COMPARE_MODE, gl.NONE );
		gl.samplerParameteri( raw, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
		gl.samplerParameteri( raw, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
		fbo = gl.createFramebuffer();
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex.shadow, 0 );
		gl.drawBuffers( [ gl.NONE ] );
		gl.readBuffer( gl.NONE );
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		const c = [ 0.03, 0.01, -0.02 ];
		lvp = mul( ortho( -0.46, 0.46, -0.46, 0.46, 0.3, 1.7 ), lookAt( c.map( ( v, i ) => v + KEY[ i ] ), c ) );
		gl.enable( gl.DEPTH_TEST );
		gl.blendFunc( gl.ONE, gl.ONE_MINUS_SRC_ALPHA );
		printed = '';
		pressed = null;
		pressedFrom = undefined;
		stale = true;
		last = '';
		lastCast = '';
	}

	// ---- The record's cut, by its share of the radius (riff.css): an LP's, or a single's.
	const cutOf = () =>
		root.dataset.riffFormat === '7'
			? { hole: 0.11, label: 0.5, out: 0.56, etch: 1.425 }
			: { hole: 0.024, label: 0.33, out: 0.4, etch: 1 };
	const LEAD_IN = 0.97;

	// ---- The label, in the page's own type, ink and paper (riff.css), set round the hole as a
	// pressed label is (below). Round it, out to the last groove, the dead wax with its matrix number.
	// Printed again only when what it says or its colours change.
	const paper = document.createElement( 'canvas' );
	paper.width = paper.height = 1024;
	const ink = paper.getContext( '2d' );
	let printed = '';
	// How many times the label or the grooves have been made again: the picture is stale after each.
	let prints = 0;
	function fit( text, width, lines ) {
		const out = [];
		let line = '';
		for ( const word of text.trim().split( /\s+/ ) ) {
			const longer = line ? `${ line } ${ word }` : word;
			if ( ! line || ink.measureText( longer ).width <= width ) {
				line = longer;
				continue;
			}
			out.push( line );
			line = word;
		}
		out.push( line );
		if ( out.length > lines ) {
			out.length = lines;
			out[ lines - 1 ] += '…';
		}
		return out.map( ( l ) => {
			while ( l.length > 1 && ink.measureText( l ).width > width ) {
				l = l.replace( /.…?$/, '…' );
			}
			return l;
		} );
	}
	function print( into ) {
		const cut = cutOf();
		const style = getComputedStyle( label );
		const tracks = label.querySelector( '.riff-label-tracks' );
		const listed = tracks && getComputedStyle( tracks ).display !== 'none' ? [ ...tracks.children ].map( ( li ) => li.textContent ) : [];
		const words = {
			album: label.querySelector( 'b' )?.textContent || '',
			artist: label.querySelector( 'i' )?.textContent || '',
			speed: label.querySelector( 'small' )?.textContent || '',
			etch: record.querySelector( '[data-riff-etch]' )?.textContent || '',
		};
		const key = JSON.stringify( [ words, listed, style.backgroundColor, style.color, style.fontFamily, cut ] );
		if ( key === printed ) {
			return;
		}
		printed = key;
		prints++;
		const mid = paper.width / 2;
		// The label's width on the paper: the paper reaches the last groove.
		const D = ( paper.width * cut.label ) / cut.out;
		const type = ( weight, share ) => {
			ink.font = `${ weight } ${ ( share * D ).toFixed( 1 ) }px ${ style.fontFamily }`;
			return share * D * 1.15;
		};
		ink.clearRect( 0, 0, paper.width, paper.height );
		ink.save();
		ink.beginPath();
		ink.arc( mid, mid, D / 2, 0, TAU );
		ink.clip();
		ink.fillStyle = style.backgroundColor;
		ink.fillRect( 0, 0, paper.width, paper.height );
		ink.fillStyle = style.color;
		ink.textAlign = 'center';
		ink.textBaseline = 'alphabetic';
		// Set round the hole, as a pressed label is: the album along the top of the label, the artist
		// along its foot, the side and speed either side of the hole, the side's tracks under it. The
		// spindle, seen from the chair, stands over the label from its middle to about 0.32 of its
		// width behind it, so the album and the artist, set out beyond that, never pass under it.
		// Each arc is read upright from the front: the album's letters stand out from the middle,
		// the artist's in toward it.
		const arc = ( text, radius, most, weight, largest, least, under ) => {
			let share = largest;
			type( weight, share );
			while ( share > least && ink.measureText( text ).width > radius * most ) {
				share -= 0.004;
				type( weight, share );
			}
			let line = text;
			while ( line.length > 1 && ink.measureText( line ).width > radius * most ) {
				line = line.replace( /.…?$/, '…' );
			}
			ink.textAlign = 'center';
			ink.textBaseline = 'alphabetic';
			let a = ( under ? Math.PI / 2 : -Math.PI / 2 ) + ( under ? 1 : -1 ) * ( ink.measureText( line ).width / radius / 2 );
			for ( const letter of line ) {
				const step = ink.measureText( letter ).width / radius;
				a += ( under ? -1 : 1 ) * ( step / 2 );
				ink.save();
				ink.translate( mid + radius * Math.cos( a ), mid + radius * Math.sin( a ) );
				ink.rotate( under ? a - Math.PI / 2 : a + Math.PI / 2 );
				ink.fillText( letter, 0, 0 );
				ink.restore();
				a += ( under ? -1 : 1 ) * ( step / 2 );
			}
		};
		arc( words.album, 0.345 * D, 3.3, 700, 0.088, 0.058, false );
		ink.globalAlpha = 0.85;
		arc( words.artist, 0.43 * D, 2.4, 500, 0.056, 0.04, true );
		ink.globalAlpha = 0.7;
		type( 500, 0.045 );
		ink.textBaseline = 'middle';
		const [ side, speed ] = words.speed.split( /\s*·\s*/ );
		ink.textAlign = 'right';
		ink.fillText( speed === undefined ? '' : side, mid - 0.12 * D, mid );
		ink.textAlign = 'left';
		ink.fillText( speed === undefined ? side : speed, mid + 0.12 * D, mid );
		ink.textAlign = 'center';
		ink.textBaseline = 'top';
		ink.globalAlpha = 0.8;
		const y = mid + 0.11 * D;
		// A long side in two columns, smaller, as a pressed label sets it.
		const two = listed.length >= 6;
		const leading = type( 400, two ? 0.025 : 0.03 ) * 1.17;
		const column = two ? 0.27 * D : 0.6 * D;
		const rows = Math.min( 6, two ? Math.ceil( listed.length / 2 ) : listed.length );
		listed.slice( 0, two ? 2 * rows : rows ).forEach( ( text, i ) => {
			const x = two ? mid + ( i < rows ? -0.15 : 0.15 ) * D : mid;
			ink.fillText( fit( text, column, 1 )[ 0 ], x, y + ( i % rows ) * leading );
		} );
		ink.restore();
		// The matrix number round the dead wax, from nine o'clock over the top, as the page sets it.
		if ( words.etch ) {
			const perMetre = mid / ( cut.out * R );
			const round = 0.186 * MM * cut.etch * perMetre;
			ink.font = `500 ${ ( 0.016 * MM * cut.etch * perMetre ).toFixed( 1 ) }px ui-monospace, "SF Mono", menlo, monospace`;
			ink.fillStyle = '#fff';
			ink.textAlign = 'left';
			ink.textBaseline = 'alphabetic';
			let a = Math.PI;
			for ( const letter of words.etch ) {
				ink.save();
				ink.translate( mid + round * Math.cos( a ), mid + round * Math.sin( a ) );
				ink.rotate( a + Math.PI / 2 );
				ink.fillText( letter, 0, 0 );
				ink.restore();
				a += ( ink.measureText( letter ).width + 0.003 * MM * cut.etch * perMetre ) / round;
			}
		}
		gl.bindTexture( gl.TEXTURE_2D, into );
		gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, true );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper );
		gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, false );
		gl.generateMipmap( gl.TEXTURE_2D );
		// Seen from the chair the label lies at a slant: filtered along the slant, its type stays sharp.
		const slant = gl.getExtension( 'EXT_texture_filter_anisotropic' );
		if ( slant ) {
			gl.texParameterf( gl.TEXTURE_2D, slant.TEXTURE_MAX_ANISOTROPY_EXT, Math.min( 8, gl.getParameter( slant.MAX_TEXTURE_MAX_ANISOTROPY_EXT ) ) );
		}
	}
	// The page's type arrives after the first print.
	document.fonts?.ready.then( () => {
		printed = '';
		stale = true;
		wake();
	} );

	// ---- The cover, for the face of the sleeve standing on the ledge: the page's own picture, taken
	// again when it changes. A picture from another origin, as a site whose uploads a CDN serves
	// has, can't be read from the page's own <img>, which asks for it without CORS so it shows
	// wherever the CDN sends no CORS header. The sleeve then asks for a copy of its own with CORS
	// (helpers.js, readable()), and where that is refused too the sleeve is plain card.
	// data-riff-cover on the canvas says which: 1 the cover, 0 plain card.
	let covered = '';
	let coverOn = 0;
	function upload( picture ) {
		gl.bindTexture( gl.TEXTURE_2D, tex.cover );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture );
		gl.generateMipmap( gl.TEXTURE_2D );
		coverOn = 1;
		canvas.dataset.riffCover = '1';
	}
	function plain() {
		coverOn = 0;
		canvas.dataset.riffCover = '0';
	}
	function hang() {
		const src = cover?.currentSrc || cover?.src || '';
		if ( src === covered || ! cover.complete || ! cover.naturalWidth ) {
			return;
		}
		covered = src;
		coverOn = 0;
		delete canvas.dataset.riffCover;
		try {
			upload( cover );
			return;
		} catch {}
		// Only for the cover still showing, into the textures of now: another track's cover, or a
		// context lost and made again, has set covered since.
		readable( src ).then( ( copy ) => {
			if ( covered !== src || gl.isContextLost() ) {
				return;
			}
			if ( copy ) {
				try {
					upload( copy );
				} catch {
					plain();
				}
			} else {
				plain();
				// eslint-disable-next-line no-console
				console.debug( `Riff: the cover can't be read from its origin, as one that sends no Access-Control-Allow-Origin header, so the drawn sleeve is plain card: ${ src }` );
			}
			wake();
		} );
	}

	// ---- The side's grooves (now-playing.js, cut()): from the last groove out to the first, a gap
	// between each two tracks, and each track cut as hard as its music is loud, where that has
	// been measured; where it hasn't, as an even cut with the small swell any music has.
	// Made again only for another side (now-playing.js hands over a new one each time) or another cut.
	let pressed = null;
	let pressedFrom;
	function press() {
		const side = P.pressed || null;
		const cut = cutOf();
		if ( side === pressedFrom && cut.out === pressed ) {
			return;
		}
		pressedFrom = side;
		pressed = cut.out;
		prints++;
		const N = 1024;
		const data = new Uint8Array( N );
		const lengths = side?.lengths || [];
		const whole = lengths.reduce( ( a, b ) => a + b, 0 );
		// Half a gap, as a share of the side: 0.35% of the radius either way.
		const gap = 0.0035 / ( LEAD_IN - cut.out );
		const swell = ( x ) => 0.5 + 0.5 * Math.sin( x * 6.1 ) * Math.sin( x * 2.3 + 1.7 );
		for ( let i = 0; i < N; i++ ) {
			const played = 1 - i / ( N - 1 );
			let vis = 0.36 + 0.16 * swell( played * 40 );
			let from = 0;
			for ( let k = 0; whole && k < lengths.length; k++ ) {
				const to = from + lengths[ k ] / whole;
				if ( k && Math.abs( played - from ) < gap ) {
					vis = -1;
					break;
				}
				if ( played >= from && played <= to ) {
					const levels = side.levels?.[ k ] || '';
					if ( levels ) {
						const j = Math.min( levels.length - 1, Math.floor( ( ( played - from ) / ( to - from ) ) * levels.length ) );
						vis = 0.1 + 0.85 * ( Number( levels[ j ] ) / 9 );
					} else {
						vis = 0.36 + 0.16 * swell( played * 40 + k * 17 );
					}
				}
				from = to;
			}
			data[ i ] = vis < 0 ? 0 : 1 + Math.round( 254 * vis );
		}
		gl.bindTexture( gl.TEXTURE_2D, tex.bands );
		gl.pixelStorei( gl.UNPACK_ALIGNMENT, 1 );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.R8, N, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data );
	}

	// The cartridge takes the cover's accent, as the player's own marks do.
	const probe = document.createElement( 'canvas' ).getContext( '2d', { willReadFrequently: true } );
	// The plinth is its own anthracite, with only a breath of the page's tint, as a thing on a
	// desk takes a little of the room's colour.
	const PLATE = [ 0.06, 0.062, 0.068 ];
	let accented = '';
	let cartridge = [ 0.8, 0.36, 0.05 ];
	let tint = PLATE;
	const linear = ( value, or ) => {
		if ( ! value || ! probe ) {
			return or;
		}
		probe.clearRect( 0, 0, 1, 1 );
		probe.fillStyle = value;
		probe.fillRect( 0, 0, 1, 1 );
		return [ ...probe.getImageData( 0, 0, 1, 1 ).data ].slice( 0, 3 ).map( ( v ) => Math.pow( v / 255, 2.2 ) );
	};
	function accent() {
		const value = `${ root.style.getPropertyValue( '--riff-cover-accent' ) }|${ root.style.getPropertyValue( '--riff-tint' ) }`;
		if ( value === accented ) {
			return;
		}
		accented = value;
		cartridge = linear( root.style.getPropertyValue( '--riff-cover-accent' ), [ 0.8, 0.36, 0.05 ] );
		tint = linear( root.style.getPropertyValue( '--riff-tint' ), PLATE );
	}

	// ---- A frame: where the page has everything, and the scene drawn there. Nothing is drawn
	// while nothing has moved.
	const degrees = ( el ) => parseFloat( getComputedStyle( el ).rotate ) || 0;
	let last = '';
	let lastTurning = '';
	let lastCast = '';
	// Whether the label's words or the colours may have changed since they were last read, and how
	// many frames have gone by with nothing to draw.
	let stale = true;
	let quiet = 0;
	// How long a frame takes, lately, and how much of the screen's sharpness is drawn.
	let slow = 1 / 60;
	let judged = 0;
	let quality = 1;
	// Until when frames are not judged: through a change of record or side and a second after (frame()).
	let excused = 0;
	let then = 0;
	let was = { spin: 0, arm: 0 };
	// The stylus's height, the strobe's two rows as the lamp shows them, and how fast the platter turns.
	let ride = UP;
	const travel = keys.map( () => 0 );
	const going = keys.map( () => 0 );
	const leant = keys.map( () => [ 0, 0 ] );
	const lamp = keys.map( () => 0 );
	// Where a mouse or a pen is, and whether it is over the deck.
	const hand = { x: 0, y: 0, over: false, on: 0 };
	stage.addEventListener(
		'pointermove',
		( event ) => {
			const b = plinth.getBoundingClientRect();
			hand.x = event.clientX;
			hand.y = event.clientY;
			hand.over =
				event.pointerType !== 'touch' &&
				( onDrawn( event.clientX, event.clientY ) ||
					( event.clientX > b.left - b.width * 0.1 && event.clientX < b.right + b.width * 0.35 && event.clientY > b.top - b.height * 0.2 && event.clientY < b.bottom + b.height * 0.25 ) );
			wake();
		},
		{ passive: true }
	);
	stage.addEventListener( 'pointerleave', () => {
		hand.over = false;
		wake();
	} );

	// ---- The laid control layer. Where each key starts on the page's flat deck, from the plinth's
	// corner, for the layout it was found for (frame()), and whether a finger is the pointer (or can
	// be: a screen that can be touched is pressed by a finger).
	let laidFor = '';
	// How far the ledge and the sleeve on it have come in, behind a record that is out.
	let stood = 0;
	let keyFrom = [];
	// Where each key was pressed on the screen, while a pointer holds it down: a key the keyboard or
	// a screen reader presses has none, and goes straight down.
	const pressedAt = new Map();
	const coarse = window.matchMedia( '(pointer: coarse)' );
	// Where the deck is drawn on the screen, last frame: its plinth's box, left, top, right, bottom.
	let drawn = null;
	const onDrawn = ( x, y ) => !! drawn && x > drawn[ 0 ] && x < drawn[ 2 ] && y > drawn[ 1 ] && y < drawn[ 3 ];
	// The page's arm and keys, laid by a transform where they are drawn (frame()), and a point of the
	// screen taken back to where it is on the page's flat deck, in the plane of the record ('record')
	// or of the arm ('arm'), for now-playing.js's own geometry (P.flat): null while nothing is laid.
	let flatten = null;
	const ARM_Z = 0.012;
	const KEYS_Z = DECK_Z + 0.003;
	const mount = arm.closest( '.riff-mount' );
	const cue = mount?.querySelector( '.riff-cue' );
	const panel = keys[ 0 ]?.closest( '.riff-keys' );
	// What a finger or a mouse presses: each key, and the pitch fader, which is its own.
	const pressables = panel ? [ ...panel.querySelectorAll( 'button, input' ) ] : [];
	// The pitch fader's range, at its cap's top, and its scale, in the plane of the cap's line, so
	// the line is read against it where the eye sees it, as a scale printed for that eye would be;
	// with where each starts on the page's flat deck, from the plinth's corner (frame()). The key by
	// its zero stands with the keys, in the panel's plane.
	const fader = panel?.querySelector( '[data-riff-pitch]' );
	const zero = panel?.querySelector( '[data-riff-reset]' );
	const planes = [ [ fader, CAP_TOP ], [ panel?.querySelector( '.riff-pitch-scale' ), CAP_TOP - 0.0006 ] ].filter( ( [ el ] ) => el );
	let planeFrom = [];
	let faderAt = null;
	let risen = 0;
	P.flat = ( x, y, plane = 'record' ) => ( flatten ? flatten( x, y, plane === 'arm' ? ARM_Z : 0 ) : [ x, y ] );
	function unlay() {
		flatten = null;
		laidFor = '';
		for ( const el of [ mount, cue, panel, ...keys, ...planes.map( ( [ part ] ) => part ) ] ) {
			el?.style.removeProperty( 'transform' );
			el?.style.removeProperty( 'transform-origin' );
			el?.style.removeProperty( 'filter' );
		}
		for ( const el of pressables ) {
			el.style.removeProperty( '--riff-hit-x' );
			el.style.removeProperty( '--riff-hit-y' );
		}
	}
	stage.addEventListener(
		'pointerdown',
		( event ) => {
			const k = keys.indexOf( event.target.closest?.( '.riff-keys button' ) );
			if ( k >= 0 ) {
				pressedAt.set( k, [ event.clientX, event.clientY ] );
			}
		},
		{ capture: true, passive: true }
	);
	for ( const type of [ 'pointerup', 'pointercancel' ] ) {
		window.addEventListener( type, () => pressedAt.clear(), { passive: true } );
	}
	let glow = 0;
	const lampRows = [ 0, 0 ];
	let speed = 0;
	let leavingSpin = 0;
	const smooth = ( a, b, x ) => {
		const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
		return t * t * ( 3 - 2 * t );
	};
	function placed( el, pb, scale, spin, fade = 1 ) {
		const b = el.getBoundingClientRect();
		const x = ( b.left + b.width / 2 - ( pb.left + pb.width / 2 ) ) / scale;
		const y = -( b.top + b.height / 2 - ( pb.top + pb.height / 2 ) ) / scale;
		const far = Math.hypot( x, y );
		// Carried a little above the mat, clear of the spindle, and down on the desk beyond the plinth.
		const z = 0.012 * smooth( 0, 0.03, far ) + ( FLOOR_Z + 0.006 - 0.012 ) * smooth( 0.33, 0.4, far );
		// Turned over (now-playing.js, flip()): lifted clear of the spindle, and higher by as much
		// as its lower edge dips as it turns about its diameter, the line from the chair. Past
		// edge-on it is the other side that faces up, so it is drawn turned back from flat.
		const style = getComputedStyle( el );
		const over = ( ( parseFloat( style.getPropertyValue( '--riff-turn' ) ) || 0 ) * Math.PI ) / 180;
		const tilt = over > Math.PI / 2 ? over - Math.PI : over;
		const lift = ( parseFloat( style.getPropertyValue( '--riff-lift' ) ) || 0 ) * SPINDLE + R * ( b.width / pb.width ) * Math.abs( Math.sin( tilt ) );
		return {
			M: chain( move( x, y, z + lift ), turnY( tilt ), size( b.width / pb.width, b.height / pb.height ), turnZ( ( -spin * Math.PI ) / 180 ) ),
			alpha: fade * ( parseFloat( style.opacity ) || 0 ),
			key: [ x, y, b.width / pb.width, b.height / pb.height, lift, tilt ].map( ( n ) => n.toFixed( 4 ) ).join(),
		};
	}
	function frame( now ) {
		raf = 0;
		if ( ! active() ) {
			return;
		}
		raf = requestAnimationFrame( frame );
		const pb = plinth.getBoundingClientRect();
		const cb = canvas.getBoundingClientRect();
		if ( ! pb.width || ! cb.width || ! cb.height ) {
			return;
		}
		const dt = Math.min( 0.1, Math.max( 0.001, ( now - then ) / 1000 ) );
		then = now;
		const scale = pb.width / MM;
		const out = root.dataset.riffDeck === 'out';
		const deckAlpha = parseFloat( getComputedStyle( plinth ).opacity ) || 0;

		// The platter's turn, and from it the strobe: between two of the lamp's 120 flashes a second
		// the platter turns some way, and a row seems to move by what is left over after whole dots.
		const spin = degrees( wax );
		const turned = ( ( ( spin - was.spin + 540 ) % 360 ) - 180 ) / dt;
		speed += ( turned - speed ) * Math.min( 1, dt * 12 );
		[ 216, 160 ].forEach( ( dots, k ) => {
			const dot = 360 / dots;
			const step = speed / 120;
			lampRows[ k ] = ( lampRows[ k ] + ( step - dot * Math.round( step / dot ) ) * 120 * dt ) % 360;
		} );

		// The arm: its turn in the page, and its height. The cue lever lifts it quickly and lowers it
		// at its damping's even speed; carried across the record, by a hand or to a new track, it is up.
		const turn = degrees( arm ) + degrees( wand );
		const carried = Math.abs( turn - was.arm ) / dt > 2;
		const up = ! out || ! ( 'riffDown' in arm.dataset ) || arm.dataset.riffUp === '' || 'riffHeld' in arm.dataset || carried;
		ride = up ? ride + ( UP - ride ) * Math.min( 1, dt * 14 ) : Math.max( 0, ride - ( UP / 0.5 ) * dt );
		was = { spin, arm: turn };

		// A record leaving with its sleeve (now-playing.js, change()) keeps the label it has.
		const copy = stage.querySelector( '.riff-leaving .riff-record' );
		if ( copy && ! tex.leaving ) {
			tex.leaving = tex.label;
			tex.label = texture( gl.LINEAR_MIPMAP_LINEAR );
			printed = '';
			stale = true;
			leavingSpin = spin;
		} else if ( ! copy && tex.leaving ) {
			gl.deleteTexture( tex.leaving );
			tex.leaving = null;
		}
		// A change of record or side (a record leaving, arriving or turning over, a side pressed) is
		// the page's work and this one's, done once: not the card's pace, so it is not judged (below).
		if ( copy || 'riffArriving' in root.dataset || record.getAnimations().some( ( a ) => a.playState === 'running' ) || ( P.pressed || null ) !== pressedFrom ) {
			excused = now + 1000;
		}
		if ( stale ) {
			stale = false;
			print( tex.label );
			accent();
		}
		press();

		const discs = [ { ...placed( record, pb, scale, spin ), label: tex.label } ];
		if ( copy ) {
			discs.push( { ...placed( copy, pb, scale, leavingSpin, parseFloat( getComputedStyle( copy.parentNode ).opacity ) || 0 ), label: tex.leaving } );
		}
		const dpr = quality * Math.min( 2, window.devicePixelRatio || 1, Math.sqrt( MOST / ( cb.width * cb.height ) ) );
		const w = Math.round( cb.width * dpr );
		const h = Math.round( cb.height * dpr );
		const cueAt = ( P.cueAt || 0 ) * R;
		// Where the stylus is, from the spindle, while it is in the groove, and how brightly the
		// groove under it is lit: by the music's level where that can be read (level.js), evenly
		// where it can't, and not at all while nothing plays.
		const swung = -Math.PI / 2 - ( turn * Math.PI ) / 180;
		const nowAt = out && ride === 0 ? Math.hypot( PIVOT[ 0 ] + LE * Math.cos( swung ), PIVOT[ 1 ] + LE * Math.sin( swung ) ) : 0;
		const sounding = root.dataset.playing === 'true' && 'riffTurning' in root.dataset;
		const lit = P.loud === null || P.loud === undefined ? 0.4 : Math.min( 1, Math.max( 0, ( P.loud + 42 ) / 34 ) );
		glow += ( ( sounding ? lit : 0 ) - glow ) * Math.min( 1, dt * 8 );
		// Whether the keys are drawn: while they are shown.
		const keyed = keys.length === KEYS.length && getComputedStyle( keys[ 0 ] ).display !== 'none';

		// The eye, in the chair: the spindle where the page has it, a little lower, and the platter as
		// wide; the ledge and its sleeve come in behind a record that is out.
		const arriving = 'riffArriving' in root.dataset;
		const ease = ( from, to, time ) => {
			const next = P.reduce() ? to : from + ( to - from ) * ( 1 - Math.exp( -dt / time ) );
			return Math.abs( to - next ) < 0.002 ? to : next;
		};
		stood = ease( stood, out && ! arriving ? 1 : 0, 0.3 );
		const [ mx, my ] = [ pb.left + pb.width / 2, pb.top + pb.height / 2 ];
		const room = stage.getBoundingClientRect();
		// Where the eye is, what it sees, and the window it sees through, its edges on the near plane:
		// the whole plinth inside the stage, clear of its sides and its foot, across its middle and
		// standing at its foot, and no taller than its share of the stage; above it the sleeve, whole.
		const see = () => {
			const to = SEAT.at;
			const spot = [ to[ 0 ], to[ 1 ] - SEAT.away * Math.cos( SEAT.rise ), to[ 2 ] + SEAT.away * Math.sin( SEAT.rise ) ];
			const looks = viewOf( spot, unit( sub( to, spot ) ), [ 1, 0, 0 ] );
			const nz = 0.05;
			const near = ( [ x, y, z ] ) => {
				const v = [ 0, 1, 2 ].map( ( r ) => looks[ r ] * x + looks[ 4 + r ] * y + looks[ 8 + r ] * z + looks[ 12 + r ] );
				return [ ( v[ 0 ] * nz ) / -v[ 2 ], ( v[ 1 ] * nz ) / -v[ 2 ] ];
			};
			const margin = Math.max( 8, 0.025 * Math.min( room.width, room.height ) );
			const [ x0, y0, x1, y1 ] = DECK.body;
			const ends = [ x0, x1 ].flatMap( ( x ) => [ y0, y1 ].flatMap( ( y ) => [ FLOOR_Z, 0.05 ].map( ( z ) => near( [ x, y, z ] ) ) ) );
			const [ nx0, nx1 ] = [ Math.min( ...ends.map( ( q ) => q[ 0 ] ) ), Math.max( ...ends.map( ( q ) => q[ 0 ] ) ) ];
			const ny0 = Math.min( ...ends.map( ( q ) => q[ 1 ] ) );
			const ny1 = Math.max( ...ends.map( ( q ) => q[ 1 ] ) );
			// The sleeve's top edge, so it stands whole in the window, never cut by its top.
			const crown = Math.max( ...[ -SL, SL ].map( ( x ) => near( [ 0, 1, 2 ].map( ( r ) => SLEEVE_AT[ r ] * x + SLEEVE_AT[ 8 + r ] * 2 * SL + SLEEVE_AT[ 12 + r ] ) )[ 1 ] ) );
			const per = Math.max(
				( nx1 - nx0 ) / ( room.width - 2 * margin ),
				( ny1 - ny0 ) / ( ( room.height - 2 * margin ) * SEAT.room ),
				( crown - ny0 ) / ( room.height - 3 * margin )
			);
			const [ ax, ay, cx ] = [ ( room.left + room.right ) / 2, room.bottom - margin, ( nx0 + nx1 ) / 2 ];
			const edges = [ cx + ( cb.left - ax ) * per, cx + ( cb.right - ax ) * per, ny0 - ( cb.bottom - ay ) * per, ny0 - ( cb.top - ay ) * per ];
			return { at: spot, looks, nz, edges, vp: mul( frustum( ...edges, nz, SEAT.away + 3 ), looks ) };
		};
		const { at: eye, looks: view, nz: nearZ, edges: win, vp } = see();
		if ( canvas.dataset.riffCamera !== 'across' ) {
			canvas.dataset.riffCamera = 'across';
		}
		// A box of the page's flat deck, in a plane of the deck, on the screen as the eye sees it.
		const seen = ( [ x0, y0, x1, y1 ], z ) => {
			const extent = [ Infinity, Infinity, -Infinity, -Infinity ];
			for ( const [ x, y ] of [ [ x0, y0 ], [ x1, y0 ], [ x0, y1 ], [ x1, y1 ] ] ) {
				const p = [ ( x - mx ) / scale, -( y - my ) / scale, z ];
				const c = [ 0, 1, 3 ].map( ( r ) => vp[ r ] * p[ 0 ] + vp[ 4 + r ] * p[ 1 ] + vp[ 8 + r ] * p[ 2 ] + vp[ 12 + r ] );
				const [ sx, sy ] = [ ( ( c[ 0 ] / c[ 2 ] + 1 ) / 2 ) * cb.width, ( ( 1 - c[ 1 ] / c[ 2 ] ) / 2 ) * cb.height ];
				extent.splice( 0, 4, Math.min( extent[ 0 ], sx ), Math.min( extent[ 1 ], sy ), Math.max( extent[ 2 ], sx ), Math.max( extent[ 3 ], sy ) );
			}
			return extent;
		};
		// Each key and the pitch fader reach past what is drawn of them, invisibly, as far as a finger
		// (44px) or a mouse (24px) needs to press them (WCAG 2.5.5, 2.5.8), with a little to spare for a
		// key pressed off its middle, and never into a neighbour's reach: on the panel's own plane,
		// where two that don't meet can't meet on the screen either. Found again only when the layout
		// changes.
		const target = coarse.matches || navigator.maxTouchPoints > 0 ? 44 : 24;
		const layout = [ cb.left, cb.top, cb.width, cb.height, pb.left, pb.top, pb.width, room.width, room.height, keyed, target ].map( String ).join( '|' );
		if ( keyed && panel && layout !== laidFor ) {
			laidFor = layout;
			const lifted = [ panel, ...keys, ...planes.map( ( [ part ] ) => part ) ];
			const laid = lifted.map( ( el ) => el.style.transform );
			lifted.forEach( ( el ) => ( el.style.transform = 'none' ) );
			for ( const el of pressables ) {
				el.style.removeProperty( '--riff-hit-x' );
				el.style.removeProperty( '--riff-hit-y' );
			}
			const flatBoxes = pressables.map( ( el ) => {
				const r = el.getBoundingClientRect();
				return [ r.left, r.top, r.right, r.bottom ];
			} );
			keyFrom = keys.map( ( key ) => {
				const r = key.getBoundingClientRect();
				return [ r.left - pb.left, r.top - pb.top ];
			} );
			lifted.forEach( ( el, i ) => ( el.style.transform = laid[ i ] ) );
			const reach = flatBoxes.map( ( b ) => {
				if ( b[ 2 ] - b[ 0 ] <= 0 ) {
					return [ 0, 0 ];
				}
				const on = seen( b, KEYS_Z );
				const need = target * 1.06;
				return [ 0, 1 ].map( ( n ) => Math.max( 0, ( ( need / ( on[ n + 2 ] - on[ n ] ) - 1 ) * ( b[ n + 2 ] - b[ n ] ) ) / 2 ) );
			} );
			// Two that would meet share the gap between them, keeping a few pixels of it between them:
			// each reaches no more than half of the rest.
			const GAP = 4;
			flatBoxes.forEach( ( a, i ) =>
				flatBoxes.forEach( ( b, j ) => {
					if ( j <= i || a[ 2 ] <= a[ 0 ] || b[ 2 ] <= b[ 0 ] ) {
						return;
					}
					const apart = [ Math.max( b[ 0 ] - a[ 2 ], a[ 0 ] - b[ 2 ] ), Math.max( b[ 1 ] - a[ 3 ], a[ 1 ] - b[ 3 ] ) ];
					const n = apart[ 0 ] >= apart[ 1 ] ? 0 : 1;
					if ( apart[ n ] >= 0 && reach[ i ][ n ] + reach[ j ][ n ] > apart[ n ] - GAP ) {
						const most = Math.max( 0, ( apart[ n ] - GAP ) / 2 );
						reach[ i ][ n ] = Math.min( reach[ i ][ n ], Math.max( most, apart[ n ] - GAP - reach[ j ][ n ] ) );
						reach[ j ][ n ] = Math.max( 0, Math.min( reach[ j ][ n ], apart[ n ] - GAP - reach[ i ][ n ] ) );
					}
				} )
			);
			pressables.forEach( ( el, i ) => {
				el.style.setProperty( '--riff-hit-x', `${ reach[ i ][ 0 ].toFixed( 1 ) }px` );
				el.style.setProperty( '--riff-hit-y', `${ reach[ i ][ 1 ].toFixed( 1 ) }px` );
			} );
			// The fader's range and its scale, once the range reaches as far as it does.
			lifted.forEach( ( el ) => ( el.style.transform = 'none' ) );
			planeFrom = planes.map( ( [ el ] ) => {
				const r = el.getBoundingClientRect();
				return [ r.left - pb.left, r.top - pb.top ];
			} );
			lifted.forEach( ( el, i ) => ( el.style.transform = laid[ i ] ) );
		}
		// A point of the screen on the deck's plane (z), and a point of the deck on the screen.
		const onPlane = ( px, py, z ) => {
			const xn = win[ 0 ] + ( ( px - cb.left ) / cb.width ) * ( win[ 1 ] - win[ 0 ] );
			const yn = win[ 3 ] - ( ( py - cb.top ) / cb.height ) * ( win[ 3 ] - win[ 2 ] );
			const ray = [ 0, 1, 2 ].map( ( i ) => view[ i * 4 ] * xn + view[ i * 4 + 1 ] * yn - view[ i * 4 + 2 ] * nearZ );
			const t = ( z - eye[ 2 ] ) / ray[ 2 ];
			return [ eye[ 0 ] + ray[ 0 ] * t, eye[ 1 ] + ray[ 1 ] * t ];
		};
		// The page's arm and keys, each laid in its own plane where it is drawn: their flat box is the
		// plinth's, as every part of the deck's is (riff.css), carried through the eye onto the screen,
		// so a hand, a focus ring and a screen reader's box are where the drawn part is.
		// The matrix that lays a box of the page's flat deck (its coordinates from the plinth's corner)
		// where a plane of the scene, moved by M where it moves, is drawn.
		const lay = ( el, z, M ) => {
			const to = ( lx, ly ) => {
				let p = [ ( lx + pb.left - mx ) / scale, -( ly + pb.top - my ) / scale, z ];
				if ( M ) {
					p = [ 0, 1, 2 ].map( ( r ) => M[ r ] * p[ 0 ] + M[ 4 + r ] * p[ 1 ] + M[ 8 + r ] * p[ 2 ] + M[ 12 + r ] );
				}
				const c = [ 0, 1, 3 ].map( ( r ) => vp[ r ] * p[ 0 ] + vp[ 4 + r ] * p[ 1 ] + vp[ 8 + r ] * p[ 2 ] + vp[ 12 + r ] );
				return [ ( ( c[ 0 ] + c[ 2 ] ) * cb.width ) / 2 + ( cb.left - pb.left ) * c[ 2 ], ( ( c[ 2 ] - c[ 1 ] ) * cb.height ) / 2 + ( cb.top - pb.top ) * c[ 2 ], c[ 2 ] ];
			};
			const o = to( 0, 0 );
			const [ ex, ey ] = [ to( 1, 0 ), to( 0, 1 ) ].map( ( q ) => q.map( ( v, i ) => ( v - o[ i ] ) / o[ 2 ] ) );
			const n = o.map( ( v ) => v / o[ 2 ] );
			const css = `matrix3d(${ [ ex[ 0 ], ex[ 1 ], 0, ex[ 2 ], ey[ 0 ], ey[ 1 ], 0, ey[ 2 ], 0, 0, 1, 0, n[ 0 ], n[ 1 ], 0, 1 ].map( ( v ) => +v.toFixed( 8 ) ).join( ',' ) })`;
			if ( el && el.style.transform !== css ) {
				el.style.transformOrigin = '0 0';
				el.style.transform = css;
			}
			return css;
		};
		const armAt = lay( mount, ARM_Z );
		const panelAt = lay( panel, KEYS_Z );
		// The cue, which the mount holds, in the record's own plane: what the arm's plane is, undone,
		// then the record's.
		const onRecord = new DOMMatrix( armAt ).inverse().multiply( new DOMMatrix( lay( null, 0 ) ) );
		const cueLaid = `matrix3d(${ onRecord.toFloat64Array().map( ( v ) => +v.toFixed( 8 ) ).join( ',' ) })`;
		if ( cue && cue.style.transform !== cueLaid ) {
			cue.style.transformOrigin = '0 0';
			cue.style.transform = cueLaid;
		}
		flatten = ( x, y, z ) => {
			const [ X, Y ] = onPlane( x, y, z );
			return [ mx + X * scale, my - Y * scale ];
		};
		const span = ( [ x0, y0, x1, y1 ], z0, z1 ) => {
			const extent = [ Infinity, Infinity, -Infinity, -Infinity ];
			for ( const p of [ x0, x1 ].flatMap( ( x ) => [ y0, y1 ].flatMap( ( y ) => [ z0, z1 ].map( ( z ) => [ x, y, z, 1 ] ) ) ) ) {
				const c = [ 0, 1, 3 ].map( ( r ) => vp[ r ] * p[ 0 ] + vp[ 4 + r ] * p[ 1 ] + vp[ 8 + r ] * p[ 2 ] + vp[ 12 + r ] );
				const sx = cb.left + ( ( c[ 0 ] / c[ 2 ] + 1 ) / 2 ) * cb.width;
				const sy = cb.top + ( ( 1 - c[ 1 ] / c[ 2 ] ) / 2 ) * cb.height;
				extent.splice( 0, 4, Math.min( extent[ 0 ], sx ), Math.min( extent[ 1 ], sy ), Math.max( extent[ 2 ], sx ), Math.max( extent[ 3 ], sy ) );
			}
			return extent;
		};
		drawn = span( DECK.body, FLOOR_Z, 0.05 );
		// Where the plinth is drawn, for the tests that it fits.
		const drawnAt = drawn.map( Math.round ).join( ' ' );
		if ( canvas.dataset.riffDeckBox !== drawnAt ) {
			canvas.dataset.riffDeckBox = drawnAt;
		}
		hang();
		// The pointer over the deck: where it is on the deck.
		const [ handX, handY ] = onPlane( hand.x, hand.y, 0 );
		// A key is a cap on a spring. Pressed, it goes down fast and meets its lower stop firmly; let
		// go, the spring sends it back past its rest a little and it settles there in about 150 ms. The
		// long start key is stiffer than the small ones. Pressed off its middle, it tilts toward the
		// point pressed, a few degrees at most; pressed by the keyboard, straight down. With less
		// motion asked for, a plain press. Its lamp, on the plinth above it, comes on and goes off as
		// a small lamp does, not at once.
		keys.forEach( ( key, k ) => {
			const under = keyed && key.matches( ':active' ) ? 1 : 0;
			if ( P.reduce() ) {
				travel[ k ] = under;
				going[ k ] = 0;
				leant[ k ] = [ 0, 0 ];
			} else {
				const firm = k === 0 ? 1.3 : 1;
				const [ to, stiff, damp ] = under ? [ 1.4, 95 * firm, 0.7 ] : [ 0, 55 * firm, 0.5 ];
				for ( let rest = dt; rest > 0; rest -= 0.002 ) {
					const tick = Math.min( 0.002, rest );
					going[ k ] += ( stiff * stiff * ( to - travel[ k ] ) - 2 * damp * stiff * going[ k ] ) * tick;
					travel[ k ] += going[ k ] * tick;
					if ( travel[ k ] > 1 ) {
						travel[ k ] = 1;
						going[ k ] = going[ k ] > 0 ? -0.12 * going[ k ] : going[ k ];
					} else if ( travel[ k ] < -0.2 ) {
						travel[ k ] = -0.2;
						going[ k ] = 0;
					}
				}
				const pushed = pressedAt.get( k );
				if ( under && pushed ) {
					const [ px, py ] = onPlane( pushed[ 0 ], pushed[ 1 ], KEYS_Z );
					const [ left, wide, top, tall ] = KEYS[ k ];
					const half = [ ( wide * MM ) / 2, ( tall * MM ) / 2 ];
					const away = [ px - ( left + wide / 2 - 0.5 ) * MM, py - ( 0.5 - top - tall / 2 ) * MM ];
					// Its edge no more than 0.6 mm below its middle, and no more than about 3°: pressed all the way, its lowest edge still clear of the plate.
					leant[ k ] = away.map( ( o, n ) => Math.max( -1, Math.min( 1, o / half[ n ] ) ) * Math.min( 0.05, 0.0006 / half[ n ] ) );
				} else if ( under ) {
					leant[ k ] = [ 0, 0 ];
				}
			}
			const alight = k === 0 ? root.dataset.playing === 'true' : key.getAttribute( 'aria-pressed' ) === 'true' || key.getAttribute( 'aria-checked' ) === 'true' || ( key.dataset.repeat || 'off' ) !== 'off';
			lamp[ k ] += ( ( keyed && alight ? 1 : 0 ) - lamp[ k ] ) * ( 1 - Math.exp( -dt / 0.07 ) );
		} );
		const down = travel.map( ( t ) => ( Math.abs( t ) < 0.004 ? 0 : Math.round( t * 200 ) / 200 ) );
		const lamps = lamp.map( ( l ) => Math.round( l * 50 ) / 50 );
		// The fader's cap travels to where its range says, quickly, as a hand or its key sends it (at
		// once with less motion asked for), and the key by its zero rises with its lamp lit while it
		// is offered (now-playing.js) and sinks back into the plinth when it isn't.
		const faderTo = fader ? ( fader.valueAsNumber - Number( fader.min ) ) / ( Number( fader.max ) - Number( fader.min ) ) : 0.5;
		const travels = P.reduce() ? 1 : 1 - Math.exp( -dt / 0.045 );
		faderAt = faderAt === null ? faderTo : faderAt + ( faderTo - faderAt ) * travels;
		faderAt = Math.abs( faderTo - faderAt ) < 2e-4 ? faderTo : faderAt;
		const offered = zero?.hasAttribute( 'data-riff-offered' ) ? 1 : 0;
		risen += ( offered - risen ) * travels;
		risen = Math.abs( offered - risen ) < 0.02 ? offered : Math.round( risen * 100 ) / 100;
		// The pointer over the deck, as a light: where it is on the deck, and how near.
		hand.on += ( ( hand.over ? 1 : 0 ) - hand.on ) * ( 1 - Math.exp( -dt / 0.12 ) );
		const handAt = [ handX, handY, hand.on < 0.01 ? 0 : hand.on ];
		// What stands still while a record plays, and what turns. While only the platter turns, the
		// shadows are the ones already cast and only the platter's own square is drawn again: over a
		// long side that is most of every frame saved.
		const still = [
			cueAt, keyed, down.map( ( d ) => d.toFixed( 3 ) ), lamps, handAt.map( ( n ) => n.toFixed( 3 ) ), w, h, pb.left - cb.left, pb.top - cb.top, pb.width, deckAlpha, turn.toFixed( 2 ), ride, out, prints, accented,
			discs.map( ( d ) => d.key + d.alpha ),
			stood.toFixed( 3 ), covered, coverOn, cb.top, cb.left, faderAt.toFixed( 4 ), risen,
		].join( '|' );
		const turning = [ nowAt.toFixed( 5 ), glow.toFixed( 2 ), spin, speed.toFixed( 1 ), lampRows.map( ( a ) => a.toFixed( 1 ) ) ].join( '|' );
		if ( still === last && turning === lastTurning ) {
			// Nothing has moved for two seconds: the page isn't asked where things are any more,
			// until something says they may have moved (wake()).
			if ( ++quiet > 120 ) {
				cancelAnimationFrame( raf );
				raf = 0;
			}
			return;
		}
		quiet = 0;
		const whole = still !== last;
		last = still;
		// The shadows are cast again only when something that casts one has moved: not for a
		// lamp, the pointer's light or the groove pointed at.
		const cast = [ keyed, down.map( ( d ) => d.toFixed( 2 ) ), turn.toFixed( 2 ), ride, out, discs.map( ( d ) => d.key + ( d.alpha > 0.5 ) ), faderAt.toFixed( 4 ), risen ].join( '|' );
		const casting = cast !== lastCast;
		lastCast = cast;
		lastTurning = turning;
		// A card that can't keep up is asked for less: fewer pixels, twice, and after that the
		// page's own deck, for good. Judged over sixty frames drawn, so a busy moment isn't a verdict,
		// and never through a change of record or side.
		if ( now < excused ) {
			slow = 1 / 60;
			judged = 0;
		} else {
			slow += ( dt - slow ) * 0.05;
			if ( ++judged >= 60 ) {
				judged = 0;
				if ( slow > 0.034 && quality > 0.5 ) {
					quality -= 0.25;
					slow = 1 / 60;
					last = '';
				} else if ( slow > 0.034 ) {
					giveUp( 'slow' );
					return;
				}
			}
		}
		if ( canvas.width !== w || canvas.height !== h ) {
			canvas.width = w;
			canvas.height = h;
		}

		const I = ident();
		const turns = turnZ( ( -spin * Math.PI ) / 180 );
		const al = -Math.PI / 2 - ( turn * Math.PI ) / 180;
		const armM = chain( move( PIVOT[ 0 ], PIVOT[ 1 ], PIVOT_H ), turnZ( al ), turnY( -Math.asin( ride / LE ) ) );
		const head = chain( armM, move( LE, 0, 0 ), turnZ( -BETA ) );
		const lensM = chain( move( LAMP_AT[ 0 ] + 0.7071 * 0.0165, LAMP_AT[ 1 ] + 0.7071 * 0.0165, 0 ), turnZ( Math.PI / 4 ) );
		const pointer = chain( move( ANTISKATE[ 0 ], ANTISKATE[ 1 ], 0 ), turnZ( Math.PI / 2 + ( 67.5 * Math.PI ) / 180 ) );
		const on = out ? 1 : 0;
		const off = [ 0, 0, 0 ];
		const BLACK = [ 0.012, 0.012, 0.013 ];
		const CHROME = [ 0.62, 0.63, 0.66 ];
		// Each key where its travel and its lean have it, and its lamp with it.
		const capOf = DECK.caps;
		const parts = m.keyed;
		const capAt = capOf.map( ( [ cx, cy ], k ) => lean( cx, cy, DECK_Z + 0.001, -0.0018 * down[ k ], leant[ k ][ 0 ] * Math.max( 0, down[ k ] ), leant[ k ][ 1 ] * Math.max( 0, down[ k ] ) ) );
		// Each of the page's keys laid on its cap as the cap is now, so its legend sinks and tilts with
		// it, and is shaded as the cap goes down; on the panel's own transform, undone.
		if ( panelAt && keyed && keyFrom.length === keys.length ) {
			const undo = new DOMMatrix( panelAt ).inverse();
			keys.forEach( ( key, k ) => {
				const css = `matrix3d(${ undo
					.multiply( new DOMMatrix( lay( null, KEYS_Z, capAt[ k ] ) ) )
					.toFloat64Array()
					.map( ( v ) => +v.toFixed( 8 ) )
					.join( ',' ) })`;
				if ( key.style.transform !== css ) {
					key.style.transformOrigin = `${ -keyFrom[ k ][ 0 ] }px ${ -keyFrom[ k ][ 1 ] }px`;
					key.style.transform = css;
					key.style.filter = down[ k ] > 0 ? `brightness(${ ( 1 - 0.3 * down[ k ] ).toFixed( 2 ) })` : '';
				}
			} );
		}
		if ( panelAt && keyed && planeFrom.length === planes.length ) {
			const undo = new DOMMatrix( panelAt ).inverse();
			planes.forEach( ( [ el, z ], k ) => {
				const css = `matrix3d(${ undo
					.multiply( new DOMMatrix( lay( null, z ) ) )
					.toFloat64Array()
					.map( ( v ) => +v.toFixed( 8 ) )
					.join( ',' ) })`;
				if ( el.style.transform !== css ) {
					el.style.transformOrigin = `${ -planeFrom[ k ][ 0 ] }px ${ -planeFrom[ k ][ 1 ] }px`;
					el.style.transform = css;
				}
			} );
		}
		// The fader's cap, its middle from the slot's back (−8) to its front (+8), and the key by its
		// zero, sunk out of sight below the plinth's top until it rises.
		const pm = m.pitch;
		const capFrom = PITCH.back + PITCH.stop + PITCH.long / 2;
		const capM = move( ( PITCH.x - 0.5 ) * MM, ( 0.5 - capFrom - faderAt * ( PITCH.front - PITCH.stop - PITCH.long / 2 - capFrom ) ) * MM, 0 );
		const zeroM = move( 0, 0, -0.0056 * ( 1 - risen ) );
		// Each: mesh, where, colour, roughness, metallicity, mode, its own light, how much of it shows, and a key's middle and half its size.
		const items = [
			[ m.desk, I, off, 1, 0, 5, off ],
			[ keyed ? parts.body : m.body, I, BLACK, 0.62, 0, 0, off ],
			[ keyed ? parts.plate : m.plate, I, PLATE, 0.5, 0.45, 2, off ],
			...( keyed
				? [
						[ parts.wells, I, [ 0.006, 0.006, 0.007 ], 0.8, 0, 0, off ],
						...parts.keys.map( ( key, k ) => [ key, capAt[ k ], [ 0.034, 0.034, 0.038 ].map( ( c ) => c * ( 1 - 0.45 * down[ k ] ) ), 0.4, 0, 6, off, undefined, capOf[ k ] ] ),
						...parts.lamps.flatMap( ( part, k ) =>
							// Unlit, a lens of smoked glass with the light on it; lit, the amber.
							part ? [ [ part, I, [ 0.008, 0.005, 0.004 ], 0.12, 0, 7, AMBER.map( ( c ) => c * lamps[ k ] ), undefined, part.at ] ] : []
						),
				  ]
				: [] ),
			// The pitch fader: its slot, its rails and their stops in the plinth's anodised dark, and the
			// cap where its range has it, its stem in the slit, moulded as the keys' caps are; the key by
			// its zero, while it is up.
			...( keyed
				? [
						[ pm.floor, I, [ 0.004, 0.004, 0.0045 ], 0.85, 0, 0, off ],
						[ pm.slit, I, [ 0, 0, 0 ], 1, 0, 0, off ],
						[ pm.rails, I, [ 0.03, 0.03, 0.032 ], 0.3, 0.6, 0, off ],
						[ pm.cap, capM, [ 0.034, 0.034, 0.038 ], 0.4, 0, 6, off, undefined, [ 0, 0, ( PITCH.wide * MM ) / 2, ( PITCH.long * MM ) / 2 ] ],
						[ pm.line, capM, [ 0.72, 0.71, 0.68 ], 0.45, 0, 0, off ],
						...( risen > 0
							? [
									[ pm.well, zeroM, [ 0.006, 0.006, 0.007 ], 0.8, 0, 0, off ],
									[ pm.key, zeroM, [ 0.034, 0.034, 0.038 ], 0.4, 0, 6, off, undefined, pm.key.at ],
									[ pm.lamp, zeroM, [ 0.008, 0.005, 0.004 ], 0.12, 0, 7, AMBER.map( ( c ) => c * risen ), undefined, pm.lamp.at ],
							  ]
							: [] ),
				  ]
				: [] ),
			[ m.platter, turns, [ 0.075, 0.075, 0.08 ], 0.36, 1, 3, off ],
			[ m.mat, turns, [ 0.01, 0.01, 0.01 ], 0.9, 0, 0, off ],
			[ m.spindle, I, CHROME, 0.14, 1, 1, off, undefined, [ 0, 0, 0, 0 ] ],
			// The strobe's lamp, turned on top and fluted round its skirt, as the knob it is.
			[ m.lamp, I, [ 0.12, 0.12, 0.125 ], 0.36, 0.9, 1, off, undefined, [ ...LAMP_AT, 40, 0 ] ],
			[ m.lens, lensM, [ 0.15, 0.05, 0.01 ], 0.3, 0, 0, AMBER.map( ( c ) => c * on ) ],
			[ m.target, I, [ 0.03, 0.03, 0.032 ], 0.4, 0.6, 0, off ],
			[ m.targetLamp, I, [ 0.2, 0.19, 0.17 ], 0.3, 0, 0, [ 1.1 * on, 0.85 * on, 0.55 * on ] ],
			[ m.antiskate, I, [ 0.03, 0.03, 0.032 ], 0.38, 0.7, 1, off, undefined, [ ...ANTISKATE, 48, 0 ] ],
			[ m.pointer, pointer, [ 0.6, 0.6, 0.6 ], 0.5, 0, 0, off ],
			[ m.tower, I, [ 0.02, 0.02, 0.022 ], 0.38, 0.6, 0, off ],
			[ m.towerCap, I, CHROME, 0.16, 1, 1, off, undefined, [ ...PIVOT, 0, 0 ] ],
			[ m.tube, armM, [ 0.3, 0.3, 0.32 ], 0.16, 1, 0, off ],
			[ m.weight, armM, [ 0.022, 0.022, 0.024 ], 0.42, 0.7, 0, off ],
			[ m.dial, armM, CHROME, 0.28, 1, 0, off ],
			[ m.collar, head, CHROME, 0.2, 1, 0, off ],
			[ m.shell, head, [ 0.014, 0.014, 0.015 ], 0.4, 0.2, 0, off ],
			[ m.holder, head, cartridge, 0.42, 0, 0, off ],
		];
		const shown = discs.filter( ( d ) => d.alpha > 0.01 );
		for ( const d of shown ) {
			items.push( [ m.edge, d.M, [ 0.008, 0.008, 0.008 ], 0.22, 0, 0, off, d.alpha ] );
		}
		// Behind the deck, while its record plays: the ledge, and the sleeve standing on it, leant
		// back against the wall. They cast nothing: the key light is behind them, and their shadow
		// would lie across the record.
		const backdrop = [
			[ m.ledge, I, [ 0.014, 0.013, 0.013 ], 0.55, 0, 0, off, deckAlpha * stood ],
			[ m.sleeve, SLEEVE_AT, [ 0.5, 0.48, 0.45 ], 0.6, 0, 8, off, deckAlpha * stood ],
		];

		// The shadows, as the key light sees the deck: cast again only when something has moved.
		gl.disable( gl.SCISSOR_TEST );
		if ( casting ) {
			gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
			gl.viewport( 0, 0, SHADOW, SHADOW );
			gl.clear( gl.DEPTH_BUFFER_BIT );
			gl.disable( gl.BLEND );
			gl.useProgram( dep.p );
			gl.uniformMatrix4fv( dep.u.uVP, false, lvp );
			gl.enable( gl.POLYGON_OFFSET_FILL );
			gl.polygonOffset( 2, 4 );
			const casts = [ ...items.slice( 1 ), ...shown.filter( ( d ) => d.alpha > 0.5 ).map( ( d ) => [ m.disc, d.M ] ) ];
			for ( const [ part, M ] of casts ) {
				gl.uniformMatrix4fv( dep.u.uM, false, M );
				gl.bindVertexArray( part.vao );
				gl.drawArrays( gl.TRIANGLES, 0, part.count );
			}
			gl.disable( gl.POLYGON_OFFSET_FILL );
		}
		if ( ! whole ) {
			// Only the platter's box on the screen, as the eye sees it.
			const [ l, t, r, b ] = span( [ -PLATTER, -PLATTER, PLATTER, PLATTER ], -0.022, 0.012 );
			gl.enable( gl.SCISSOR_TEST );
			gl.scissor( Math.floor( ( l - cb.left ) * dpr ) - 2, Math.floor( ( cb.bottom - b ) * dpr ) - 2, Math.ceil( ( r - l ) * dpr ) + 4, Math.ceil( ( b - t ) * dpr ) + 4 );
		}

		// The deck. It fades in and out as one: nothing of it is blended with anything else of it,
		// so each pixel is the part on top, as see-through as the deck is.
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.viewport( 0, 0, w, h );
		gl.clearColor( 0, 0, 0, 0 );
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		gl.activeTexture( gl.TEXTURE3 );
		gl.bindTexture( gl.TEXTURE_2D, tex.shadow );
		gl.activeTexture( gl.TEXTURE5 );
		gl.bindTexture( gl.TEXTURE_2D, tex.shadow );
		gl.bindSampler( 5, raw );
		const common = ( u ) => {
			gl.uniformMatrix4fv( u.uVP, false, vp );
			gl.uniformMatrix4fv( u.uLVP, false, lvp );
			gl.uniform3fv( u.uEye, eye );
			gl.uniform1i( u.uShadow, 3 );
			gl.uniform1i( u.uDepth, 5 );
			gl.uniform4f( u.uLamp, ...LAMP, on );
			gl.uniform3f( u.uHand, ...handAt );
			gl.uniform4f( u.uSpot, TARGET[ 0 ], TARGET[ 1 ], 0.014, on );
		};
		let u = std.u;
		gl.useProgram( std.p );
		common( u );
		gl.uniform2f( u.uPivot, ...PIVOT );
		gl.uniform3fv( u.uTint, tint );
		gl.uniform3fv( u.uGlowAt, DECK.glows.flatMap( ( [ x, y, k ] ) => [ x, y, keyed ? lamps[ k ] : 0 ] ) );
		gl.uniform4fv( u.uCaps, ( keyed ? capOf : KEYS ).flatMap( ( cap ) => ( keyed ? cap : [ 9, 9, 0, 0 ] ) ) );
		const [ x0, y0, x1, y1 ] = keyed ? DECK.body : BODY;
		gl.uniform4f( u.uBody, ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( x1 - x0 ) / 2, ( y1 - y0 ) / 2 );
		gl.uniform2f( u.uStrobe, ( lampRows[ 0 ] * Math.PI ) / 180, ( lampRows[ 1 ] * Math.PI ) / 180 );
		gl.uniform1f( u.uBlur, Math.min( 1, Math.abs( speed ) / 40 ) );
		gl.activeTexture( gl.TEXTURE4 );
		gl.bindTexture( gl.TEXTURE_2D, tex.cover );
		gl.uniform1i( u.uCover, 4 );
		gl.uniform1f( u.uCoverOn, coverOn );
		for ( const [ part, M, col, rough, metal, mode, emis, alpha, cap ] of [ ...items, ...backdrop ] ) {
			const a = alpha ?? deckAlpha;
			if ( a <= 0.003 ) {
				continue;
			}
			gl.uniformMatrix4fv( u.uM, false, M );
			gl.uniform3fv( u.uCol, col );
			gl.uniform3fv( u.uEmis, emis );
			gl.uniform1f( u.uRough, rough );
			gl.uniform1f( u.uMetal, metal );
			gl.uniform1f( u.uAlpha, a );
			gl.uniform1i( u.uMode, mode );
			if ( cap ) {
				gl.uniform4f( u.uKey, ...cap );
			}
			gl.bindVertexArray( part.vao );
			gl.drawArrays( gl.TRIANGLES, 0, part.count );
		}

		// The records, which come and go on their own: the one playing, and one leaving with its sleeve.
		const cut = cutOf();
		u = rec.u;
		gl.useProgram( rec.p );
		common( u );
		gl.enable( gl.BLEND );
		gl.uniform4f( u.uZone, cut.hole * R, cut.label * R, cut.out * R, LEAD_IN * R );
		gl.uniform1i( u.uLabel, 0 );
		gl.uniform1i( u.uBands, 1 );
		gl.activeTexture( gl.TEXTURE1 );
		gl.bindTexture( gl.TEXTURE_2D, tex.bands );
		gl.activeTexture( gl.TEXTURE0 );
		for ( const d of shown ) {
			gl.bindTexture( gl.TEXTURE_2D, d.label );
			gl.uniformMatrix4fv( u.uM, false, d.M );
			gl.uniform1f( u.uAlpha, d.alpha );
			gl.uniform1f( u.uCue, d.label === tex.label ? cueAt : 0 );
			gl.uniform1f( u.uNow, d.label === tex.label ? nowAt : 0 );
			gl.uniform1f( u.uGlow, glow );
			gl.bindVertexArray( m.disc.vao );
			gl.drawArrays( gl.TRIANGLES, 0, m.disc.count );
		}
		gl.disable( gl.BLEND );
		gl.disable( gl.SCISSOR_TEST );
		// Drawn: the canvas shows (riff.css). Written once, not every frame.
		if ( ! ( 'riffGl' in root.dataset ) ) {
			root.dataset.riffGl = '';
			delete root.dataset.riffGlGone;
		}
	}

	// ---- It runs while the turntable is in sight, and stops when it isn't.
	let raf = 0;
	let lost = false;
	// A listener whose system forces its own colours has the cover on its own (now-playing.js).
	const forced = window.matchMedia( '(forced-colors: active)' );
	const active = () => ! lost && ! forced.matches && ! np.hidden && ! P.away() && root.dataset.riffTurntable !== 'off' && root.dataset.mode !== 'video';
	function wake() {
		quiet = 0;
		if ( ! raf && active() ) {
			last = '';
			// The time since the last frame was a rest, not a slow frame.
			then = performance.now();
			raf = requestAnimationFrame( frame );
		}
	}
	const changed = () => {
		stale = true;
		wake();
	};
	// Given up, for good: the canvas is gone, and a context that comes back is not taken up again.
	let gone = false;
	function giveUp( why ) {
		gone = true;
		lost = true;
		drop( why );
		canvas.remove();
	}
	// Not drawn from here, and #riff says why (data-riff-gl-gone: slow, build, lost or forced): Now
	// Playing is the cover on its own (now-playing.js, P.drawable) until it can be drawn again.
	function drop( why ) {
		root.dataset.riffGlGone = why;
		delete root.dataset.riffGl;
		unlay();
		P.drawable?.( false );
	}
	try {
		build();
	} catch {
		giveUp( 'build' );
		return null;
	}
	// Lost, the deck isn't drawn, so Now Playing is the cover until the context is back.
	canvas.addEventListener( 'webglcontextlost', ( event ) => {
		event.preventDefault();
		lost = true;
		drop( 'lost' );
	} );
	canvas.addEventListener( 'webglcontextrestored', () => {
		if ( gone ) {
			return;
		}
		try {
			build();
			lost = false;
			delete root.dataset.riffGlGone;
			P.drawable?.( true );
			wake();
		} catch {
			giveUp( 'build' );
		}
	} );
	// What may move something, or change what the label says: the player's own attributes and
	// colours, the record's words, the arm's place, a transition starting, a key or the pointer
	// going down or up, and the stage changing size.
	// Its own mark that it has drawn (data-riff-gl) is not news.
	new MutationObserver( ( records ) => records.some( ( r ) => r.attributeName !== 'data-riff-gl' ) && changed() ).observe( root, { attributes: true } );
	new MutationObserver( changed ).observe( record, { subtree: true, childList: true, characterData: true } );
	new MutationObserver( wake ).observe( arm, { attributes: true } );
	// The fader's key offered or taken away, and the fader moved, by any hand.
	if ( zero ) {
		new MutationObserver( wake ).observe( zero, { attributes: true, attributeFilter: [ 'data-riff-offered' ] } );
	}
	fader?.addEventListener( 'input', wake );
	new MutationObserver( wake ).observe( np, { attributes: true, attributeFilter: [ 'hidden' ] } );
	cover?.addEventListener( 'load', wake );
	for ( const moved of [ 'transitionrun', 'animationstart', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'focusin', 'focusout' ] ) {
		stage.addEventListener( moved, wake, { passive: true } );
	}
	// Now Playing too: a hidden canvas has no size to change as it grows.
	const resized = new ResizeObserver( wake );
	resized.observe( canvas );
	resized.observe( np );
	document.addEventListener( 'visibilitychange', wake );
	const recolour = () => {
		canvas.hidden = forced.matches;
		if ( forced.matches ) {
			drop( 'forced' );
		} else if ( root.dataset.riffGlGone === 'forced' ) {
			// The system's colours given back: the deck can be drawn again.
			delete root.dataset.riffGlGone;
			P.drawable?.( true );
		}
		wake();
	};
	forced.addEventListener?.( 'change', recolour );
	recolour();
	// The first frame at once, not at the next thing to move.
	if ( raf ) {
		cancelAnimationFrame( raf );
		frame( performance.now() );
	}
	return { wake };
}
