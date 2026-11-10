/* The turntable, drawn. Where the browser has WebGL2, the deck, the record and the tonearm are a
 * scene lit as a deck on a desk is: a key light that casts the arm's shadow across the record, a
 * dark room in the metal, and grooves that scatter the light as a cut record's do, in streaks
 * across the tracks, wider where the music is loud. The scene is the whole of Now Playing: the desk
 * the deck stands on is the page's own background, lit round the deck and darker toward its
 * edges, with the deck's shadow and the sleeve's on it. It is seen from straight above the
 * spindle, so the scene lies exactly where the deck in the page does.
 *
 * It draws and nothing else. The deck in the page (player.php, riff.css) is still the turntable:
 * now-playing.js moves its record, its platter and its arm, a hand still takes the arm by its grip,
 * and a screen reader still finds its slider. Each frame this reads where those are (the record's
 * place and turn, the arm's angle, the cue lever) and draws them there; riff.css stops painting the
 * page's own once `#riff` has `data-riff-gl`. Without WebGL2, or once the context is lost, the
 * attribute is gone and the deck is the page's again. Loaded on demand, when the turntable first
 * shows.
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
	const r = unit( cross( f, upHint ) );
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
const DECK_Z = -0.022;
const FLOOR_Z = -0.05;
const PIVOT_H = 0.03;
const BODY = [ -0.555 * MM, -0.555 * MM, 0.775 * MM, 0.63 * MM ];
// With the strip its keys stand on along the front, and the keys: each its left, width, top and
// height, in the record's width, where riff.css has the buttons, and where its lamp is, if it has
// one. The lamps are the one amber, as a deck's are.
const AMBER = [ 1.0, 0.46, 0.12 ];
const FRONT = -0.69 * MM;
const KEYS = [
	[ 0, 0.18, 1.075, 0.095, 'left' ],
	[ 0.215, 0.075, 1.09, 0.065, 'top' ],
	[ 0.3, 0.075, 1.09, 0.065, 'top' ],
	[ 0.41, 0.08, 1.09, 0.065, '' ],
	[ 0.5, 0.08, 1.09, 0.065, '' ],
	[ 0.615, 0.075, 1.09, 0.065, 'top' ],
	[ 0.7, 0.075, 1.09, 0.065, 'top' ],
];
// Where each lamp is on the deck, with its key's place in KEYS, for the light it spills.
const GLOWS = KEYS.flatMap( ( [ left, wide, top, , lampAt ], k ) =>
	lampAt ? [ [ ( ( lampAt === 'top' ? left + 0.5 * wide : left + 0.031 ) - 0.5 ) * MM, ( 0.5 - top - 0.0105 ) * MM, k ] ] : []
);
const LAMP_AT = [ -0.141, -0.141 ];
const LAMP = [ LAMP_AT[ 0 ] + 0.7071 * 0.022, LAMP_AT[ 1 ] + 0.7071 * 0.022, 0.006 ];
const TARGET = [ 0.51 * MM, -0.47 * MM ];
const ANTISKATE = [ 0.435 * MM, 0.52 * MM ];
const SHADOW = 2048;
// How far the eye is above the spindle: far enough that what stands above the record (the arm, its
// base) lies within a millimetre or two of where the page has it, for the hand that takes it.
const EYE = 2.2;
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

// Shading: GGX and Fresnel under the key, shadowed, and what a reflection sees, a dark room with
// three soft lights.
const COMMON = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
uniform sampler2DShadow uShadow; uniform mat4 uLVP; uniform vec3 uEye, uHand; uniform vec4 uLamp, uSpot;
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
  float a = 0.0, t = 1.7 / ${ SHADOW }.0;
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
  vec3 c = brdf(N, V, L1, F0, diff, rough) * KEYC * sh * pool(P) + brdf(N, V, L3, F0, diff, rough) * RIMC * ao + brdf(N, V, L2, F0, diff, rough) * FILLC;
  vec3 lp = uLamp.xyz - P; float ld = length(lp);
  c += brdf(N, V, lp / ld, F0, diff, max(rough, 0.3)) * LAMPC * uLamp.w * 1.6 / (1.0 + ld * ld / 0.0012);
  // A hand over the deck is a little light of its own: what it nears catches it.
  vec3 hp = vec3(uHand.xy, 0.05) - P; float hd = length(hp);
  c += brdf(N, V, hp / hd, F0, diff, max(rough, 0.28)) * vec3(1.0, 0.96, 0.9) * uHand.z * 0.55 / (1.0 + hd * hd / 0.0035);
  // The target light by the platter, which is there to see the stylus by: a small warm pool.
  vec3 tp = uSpot.xyz - P; float td = length(tp);
  c += brdf(N, V, tp / td, F0, diff, max(rough, 0.3)) * vec3(1.0, 0.93, 0.8) * uSpot.w * 0.8 / (1.0 + td * td / 0.0025);
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

// uMode: 0 plain, 1 turned metal, 2 the deck's plate, 3 the platter and its strobe, 5 the desk,
// which is only the shadows on it: the page shows through everywhere else.
const STD_FS =
	COMMON +
	`
in vec3 vP, vN, vO; out vec4 o;
uniform mat4 uM; uniform vec3 uCol, uEmis; uniform float uRough, uMetal, uAlpha, uBlur; uniform int uMode; uniform vec2 uPivot, uStrobe; uniform vec4 uSleeve, uBody; uniform vec3 uTint, uGlowAt[5]; uniform float uSleeveA;
const float RP = ${ f1( PLATTER ) };
float row(float a, float r, float n, float rr, float px) {
  vec2 c = vec2((fract(a / 6.2831853 * n) - 0.5) * 6.2831853 * rr / n, r - rr);
  return 1.0 - smoothstep(0.0006, 0.0008 + px, length(c));
}
float ring(float r, float rr, float px) { return 0.36 * (1.0 - smoothstep(0.0005, 0.0008 + px, abs(r - rr))); }
void main() {
  vec3 N = normalize(vN), alb = uCol; float rough = uRough, metal = uMetal, ao = 1.0, lit = 0.0;
  float ro = length(vO.xy), px = fwidth(vO.x) + fwidth(vO.y) + fwidth(vO.z);
  if (uMode == 5) {
    vec2 q = abs(vP.xy - uBody.xy) - uBody.zw;
    float near = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float a = 0.5 * (1.0 - shadow(vP, vec3(0.0, 0.0, 1.0))) + 0.4 * (1.0 - smoothstep(0.0, 0.035, near));
    // The sleeve lies on the desk too, and its shadow falls the way the deck's does.
    vec2 s = abs(vP.xy - uSleeve.xy - vec2(0.004, -0.004)) - uSleeve.zw;
    a += 0.45 * uSleeveA * step(1e-4, uSleeve.z) * (1.0 - smoothstep(-0.004, 0.022, length(max(s, 0.0)) + min(max(s.x, s.y), 0.0)));
    // The light falls round the deck and gives out toward the desk's edges.
    float far = length(vP.xy - vec2(0.03, 0.0));
    a = min(a, 0.85); a += (1.0 - a) * 0.5 * smoothstep(0.42, 1.25, far);
    a = clamp(a + (hash(gl_FragCoord.xy) - 0.5) / 255.0, 0.0, 1.0);
    // The light is a pale veil over the shadows, never brighter than it is opaque: a compositor
    // clamps a colour with more light in it than its alpha allows.
    float k = 0.05 * (1.0 - smoothstep(0.05, 0.8, far)) * (1.0 - a);
    o = vec4(vec3(1.0, 0.94, 0.86) * k, k + (1.0 - k) * a) * uAlpha; return;
  }
  if (uMode == 1 || uMode == 3) {
    float b = hash(vec2(floor(ro * 5000.0), 3.0)) - 0.5, fade = 1.0 - smoothstep(1e-4, 6e-4, px);
    if (abs(N.z) > 0.5) { N = normalize(N + mat3(uM) * vec3(vO.xy / max(ro, 1e-4), 0.0) * b * 0.10 * fade); rough += b * 0.10 * fade; }
  }
  if (uMode == 3 && ro > RP - 0.0108 && N.z > 0.5) {
    float r1 = 0.957 * RP, r2 = 0.979 * RP, a = atan(vO.y, vO.x), aw = atan(vP.y, vP.x);
    float still = max(row(a, ro, 216.0, r1, px), row(a, ro, 160.0, r2, px));
    float d = mix(still, max(ring(ro, r1, px), ring(ro, r2, px)), uBlur);
    alb = mix(vec3(0.012), vec3(0.11), d); rough = 0.5; metal = 0.0;
    lit = max(row(aw + uStrobe.x, ro, 216.0, r1, px), row(aw + uStrobe.y, ro, 160.0, r2, px));
  }
  if (uMode == 2) alb = mix(alb, uTint, 0.08);
  if (uMode == 2 && N.z > 0.5) {
    // Brushed, as an aluminium top plate is: fine lines along it, each a little lighter or darker
    // and a little smoother or rougher than the next.
    float brush = (hash(vec2(floor(vP.y * 6500.0), floor(vP.x * 19.0))) - 0.5) * (1.0 - smoothstep(1.5e-4, 7e-4, px));
    alb *= 1.0 + 0.2 * brush; rough += 0.1 * brush;
    alb *= 0.88 + 0.24 * hash(floor(vP.xy * 2500.0)) * (1.0 - smoothstep(2e-4, 1e-3, px));
    ao *= mix(0.35, 1.0, smoothstep(RP - 0.001, RP + 0.04, length(vP.xy))) * mix(0.45, 1.0, smoothstep(0.02, 0.05, length(vP.xy - uPivot)));
  }
  vec3 c = shade(vP, N, alb, clamp(rough, 0.06, 1.0), metal, ao) + uEmis;
  // Each lit lamp spills a little of its amber on what is round it.
  for (int i = 0; i < 5; i++) { vec2 g = vP.xy - uGlowAt[i].xy; c += vec3(1.0, 0.46, 0.12) * uGlowAt[i].z * 0.035 * step(vP.z, 0.0) / (1.0 + dot(g, g) / 0.00003); }
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
  vec3 N = vec3(0.0, 0.0, 1.0), V = normalize(uEye - vP);
  vec3 Tw = normalize(mat3(uM) * vec3(-sin(phi), cos(phi), 0.0));
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
		return null;
	}
	// Under everything Now Playing shows, over its background's washes.
	( $( '.riff-np-bg' ) || stage ).append( canvas );
	const cover = $( '.riff-cover' );
	// The deck's keys (player.php): drawn where they show, each a little lower while it is pressed.
	const keys = [ ...stage.querySelectorAll( '.riff-keys button' ) ];

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

	let m, tex, std, rec, dep, fbo, lvp;
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
	function program( vs, fs ) {
		const p = gl.createProgram();
		for ( const [ type, src ] of [ [ gl.VERTEX_SHADER, vs ], [ gl.FRAGMENT_SHADER, fs ] ] ) {
			const s = gl.createShader( type );
			gl.shaderSource( s, src );
			gl.compileShader( s );
			if ( ! gl.getShaderParameter( s, gl.COMPILE_STATUS ) ) {
				throw new Error( gl.getShaderInfoLog( s ) );
			}
			gl.attachShader( p, s );
		}
		gl.bindAttribLocation( p, 0, 'aP' );
		gl.bindAttribLocation( p, 1, 'aN' );
		gl.linkProgram( p );
		if ( ! gl.getProgramParameter( p, gl.LINK_STATUS ) ) {
			throw new Error( gl.getProgramInfoLog( p ) );
		}
		const u = {};
		for ( let i = 0; i < gl.getProgramParameter( p, gl.ACTIVE_UNIFORMS ); i++ ) {
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

	// Everything the context holds, made again if the context is lost and comes back.
	function build() {
		std = program( STD_VS, STD_FS );
		rec = program( REC_VS, REC_FS );
		dep = program( STD_VS, DEPTH_FS );
		const L = lathe;
		const [ x0, y0, x1, y1 ] = BODY;
		const RP = PLATTER;
		m = {
			desk: mesh( box( -2, -2, FLOOR_Z - 0.02, 2, 2, FLOOR_Z ) ),
			body: mesh( rbox( x0, y0, x1, y1, FLOOR_Z, -0.03, 0.012, 0.002 ) ),
			plate: mesh( rbox( x0 + 0.002, y0 + 0.002, x1 - 0.002, y1 - 0.002, -0.03, DECK_Z, 0.01, 0.0018 ) ),
			// The same with the keys' strip along the front, and the keys.
			bodyKeyed: mesh( rbox( x0, FRONT, x1, y1, FLOOR_Z, -0.03, 0.012, 0.002 ) ),
			plateKeyed: mesh( rbox( x0 + 0.002, FRONT + 0.002, x1 - 0.002, y1 - 0.002, -0.03, DECK_Z, 0.01, 0.0018 ) ),
			keys: KEYS.map( ( [ left, wide, top, tall ] ) =>
				mesh( rbox( ( left - 0.5 ) * MM, ( 0.5 - top - tall ) * MM, ( left + wide - 0.5 ) * MM, ( 0.5 - top ) * MM, DECK_Z - 0.002, DECK_Z + 0.0042, 0.0022, 0.0009 ) )
			),
			// The well each key stands in, a dark gap round it, and the lamp set into its cap: at
			// the left of start's, along the top of shuffle's and repeat's (riff.css).
			wells: mesh(
				merge(
					...KEYS.map( ( [ left, wide, top, tall ] ) =>
						rbox( ( left - 0.5 ) * MM - 0.0012, ( 0.5 - top - tall ) * MM - 0.0012, ( left + wide - 0.5 ) * MM + 0.0012, ( 0.5 - top ) * MM + 0.0012, DECK_Z - 0.001, DECK_Z + 0.0003, 0.003, 0.0002 )
					)
				)
			),
			lamps: KEYS.map( ( [ left, wide, top, , lampAt ] ) => {
				if ( ! lampAt ) {
					return null;
				}
				const [ from, to ] = lampAt === 'top' ? [ left + 0.35 * wide, left + 0.65 * wide ] : [ left + 0.016, left + 0.046 ];
				return mesh( rbox( ( from - 0.5 ) * MM, ( 0.5 - top - 0.013 ) * MM, ( to - 0.5 ) * MM, ( 0.5 - top - 0.008 ) * MM, DECK_Z + 0.0042, DECK_Z + 0.0046, 0.0006, 0.0002 ) );
			} ),
			platter: mesh( L( [ [ 0, -0.0215 ], [ RP - 0.0005, -0.0215 ], [ RP, -0.0205 ], [ RP, -0.0072 ], [ RP - 0.002, -0.0045 ], [ RP - 0.011, -0.0036 ], [ RP - 0.011, -0.0025 ], [ 0, -0.0025 ] ], 160 ) ),
			mat: mesh( L( [ [ RP - 0.013, -0.0025 ], [ RP - 0.013, -0.0013 ], [ 0, -0.0013 ] ], 96 ) ),
			spindle: mesh( L( [ [ 0.0036, -0.003 ], [ 0.0036, 0.009 ], [ 0.003, 0.0108 ], [ 0.0015, 0.0115 ], [ 0, 0.0115 ] ], 24 ) ),
			edge: mesh( cyl( R, R, -0.0013, 0, 128, false ) ),
			disc: mesh( annulus( 0.0036, R ) ),
			lamp: mesh( merge( at( L( [ [ 0.017, DECK_Z ], [ 0.017, 0.002 ], [ 0.0155, 0.0035 ], [ 0, 0.0035 ] ], 32 ), ...LAMP_AT ) ) ),
			lens: mesh( box( -0.0015, -0.006, -0.006, 0.0015, 0.006, 0.0045 ) ),
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
		};
		gl.bindTexture( gl.TEXTURE_2D, tex.shadow );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL );
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

	// ---- The label, printed as the page prints it (riff.css): the album across the top half, the
	// side and speed beside the hole, the artist and the side's tracks below, in the page's own
	// type, ink and paper. Round it, out to the last groove, the dead wax with its matrix number.
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
		const top = mid - D / 2;
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
		const wide = 0.68 * D;
		let leading = type( 700, 0.09 );
		fit( words.album, wide, 2 )
			.reverse()
			.forEach( ( line, i ) => ink.fillText( line, mid, top + 0.355 * D - i * leading ) );
		ink.globalAlpha = 0.7;
		type( 400, 0.045 );
		ink.textAlign = 'left';
		ink.textBaseline = 'middle';
		ink.fillText( words.speed, top + 0.12 * D, mid );
		ink.textAlign = 'center';
		ink.textBaseline = 'top';
		ink.globalAlpha = 0.85;
		leading = type( 400, 0.06 );
		let y = top + 0.62 * D;
		for ( const line of fit( words.artist, wide, 2 ) ) {
			ink.fillText( line, mid, y );
			y += leading;
		}
		ink.globalAlpha = 0.8;
		y += 0.02 * D;
		// A long side in two columns, smaller, as a pressed label sets it.
		const two = listed.length >= 6;
		leading = type( 400, two ? 0.025 : 0.034 ) * 1.17;
		const column = two ? 0.27 * D : wide;
		const rows = two ? Math.ceil( listed.length / 2 ) : listed.length;
		listed.forEach( ( text, i ) => {
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
	}
	// The page's type arrives after the first print.
	document.fonts?.ready.then( () => {
		printed = '';
		stale = true;
		wake();
	} );

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
	let then = 0;
	let was = { spin: 0, arm: 0 };
	// The stylus's height, the strobe's two rows as the lamp shows them, and how fast the platter turns.
	let ride = UP;
	const travel = keys.map( () => 0 );
	const lamp = keys.map( () => 0 );
	// Where a mouse or a pen is, and whether it is over the deck.
	const hand = { x: 0, y: 0, over: false, on: 0 };
	stage.addEventListener(
		'pointermove',
		( event ) => {
			const b = plinth.getBoundingClientRect();
			hand.x = event.clientX;
			hand.y = event.clientY;
			hand.over = event.pointerType !== 'touch' && event.clientX > b.left - b.width * 0.1 && event.clientX < b.right + b.width * 0.35 && event.clientY > b.top - b.height * 0.2 && event.clientY < b.bottom + b.height * 0.25;
			wake();
		},
		{ passive: true }
	);
	stage.addEventListener( 'pointerleave', () => {
		hand.over = false;
	} );
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
		return {
			M: chain( move( x, y, z ), size( b.width / pb.width, b.height / pb.height ), turnZ( ( -spin * Math.PI ) / 180 ) ),
			alpha: fade * ( parseFloat( getComputedStyle( el ).opacity ) || 0 ),
			key: [ x, y, b.width / pb.width, b.height / pb.height ].map( ( n ) => n.toFixed( 4 ) ).join(),
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
		// The sleeve on the desk: its middle and half its size, for its shadow.
		const sb = cover?.getBoundingClientRect();
		const sleeveShown = sb?.width ? parseFloat( getComputedStyle( cover ).opacity ) || 0 : 0;
		const sleeve = sb?.width
			? [ ( sb.left + sb.width / 2 - ( pb.left + pb.width / 2 ) ) / scale, -( sb.top + sb.height / 2 - ( pb.top + pb.height / 2 ) ) / scale, sb.width / 2 / scale, sb.height / 2 / scale ]
			: [ 0, 0, 0, 0 ];
		const cueAt = ( P.cueAt || 0 ) * R;
		// Where the stylus is, from the spindle, while it is in the groove, and how brightly the
		// groove under it is lit: by the music's level where that can be read (level.js), evenly
		// where it can't, and not at all while nothing plays.
		const swung = -Math.PI / 2 - ( turn * Math.PI ) / 180;
		const nowAt = out && ride === 0 ? Math.hypot( PIVOT[ 0 ] + LE * Math.cos( swung ), PIVOT[ 1 ] + LE * Math.sin( swung ) ) : 0;
		const sounding = root.dataset.playing === 'true' && 'riffTurning' in root.dataset;
		const lit = P.loud === null || P.loud === undefined ? 0.4 : Math.min( 1, Math.max( 0, ( P.loud + 42 ) / 34 ) );
		glow += ( ( sounding ? lit : 0 ) - glow ) * Math.min( 1, dt * 8 );
		const keyed = keys.length === KEYS.length && getComputedStyle( keys[ 0 ] ).display !== 'none';
		// A key goes down under the finger quickly and comes back on its spring a little slower;
		// its lamp comes on and goes off as a small lamp does, not at once.
		keys.forEach( ( key, k ) => {
			const under = keyed && key.matches( ':active' ) ? 1 : 0;
			travel[ k ] += ( under - travel[ k ] ) * ( 1 - Math.exp( -dt / ( under ? 0.016 : 0.05 ) ) );
			const alight = k === 0 ? root.dataset.playing === 'true' : key.getAttribute( 'aria-pressed' ) === 'true' || key.getAttribute( 'aria-checked' ) === 'true' || ( key.dataset.repeat || 'off' ) !== 'off';
			lamp[ k ] += ( ( keyed && alight ? 1 : 0 ) - lamp[ k ] ) * ( 1 - Math.exp( -dt / 0.07 ) );
		} );
		const down = travel.map( ( t ) => ( Math.abs( t ) < 0.004 ? 0 : Math.min( 1, t ) ) );
		const lamps = lamp.map( ( l ) => Math.round( l * 50 ) / 50 );
		// The pointer over the deck, as a light: where it is on the deck, and how near.
		hand.on += ( ( hand.over ? 1 : 0 ) - hand.on ) * ( 1 - Math.exp( -dt / 0.12 ) );
		const handAt = [ ( hand.x - ( pb.left + pb.width / 2 ) ) / scale, -( hand.y - ( pb.top + pb.height / 2 ) ) / scale, hand.on < 0.01 ? 0 : hand.on ];
		// What stands still while a record plays, and what turns. While only the platter turns, the
		// shadows are the ones already cast and only the platter's own square is drawn again: over a
		// long side that is most of every frame saved.
		const still = [
			cueAt, keyed, down.map( ( d ) => d.toFixed( 2 ) ), lamps, handAt.map( ( n ) => n.toFixed( 3 ) ), w, h, pb.left - cb.left, pb.top - cb.top, pb.width, deckAlpha, turn.toFixed( 2 ), ride, out, prints, accented,
			sleeve.map( ( n ) => n.toFixed( 4 ) ), sleeveShown.toFixed( 2 ), discs.map( ( d ) => d.key + d.alpha ),
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
		const cast = [ keyed, down.map( ( d ) => d.toFixed( 2 ) ), turn.toFixed( 2 ), ride, out, discs.map( ( d ) => d.key + ( d.alpha > 0.5 ) ) ].join( '|' );
		const casting = cast !== lastCast;
		lastCast = cast;
		lastTurning = turning;
		// A card that can't keep up is asked for less: fewer pixels, twice, and after that the
		// page's own deck, for good. Judged over sixty frames drawn, so a busy moment isn't a verdict.
		slow += ( dt - slow ) * 0.05;
		if ( ++judged >= 60 ) {
			judged = 0;
			if ( slow > 0.034 && quality > 0.5 ) {
				quality -= 0.25;
				slow = 1 / 60;
				last = '';
			} else if ( slow > 0.034 ) {
				giveUp();
				return;
			}
		}
		if ( canvas.width !== w || canvas.height !== h ) {
			canvas.width = w;
			canvas.height = h;
		}

		// The eye, straight above the spindle, and the canvas its window, wherever in it the deck
		// stands: the record's plane is drawn at the page's own scale everywhere.
		const eye = [ 0, 0, EYE ];
		const near = EYE - 0.2;
		const edge = ( px, from ) => ( ( ( px - from ) / scale ) * near ) / EYE;
		const [ mx, my ] = [ pb.left + pb.width / 2, pb.top + pb.height / 2 ];
		const vp = mul(
			frustum( edge( cb.left, mx ), edge( cb.right, mx ), -edge( cb.bottom, my ), -edge( cb.top, my ), near, EYE + 0.2 ),
			lookAt( eye, [ 0, 0, 0 ], [ 0, 1, 0 ] )
		);
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
		// Each: mesh, where, colour, roughness, metalness, mode, its own light.
		const items = [
			[ m.desk, I, off, 1, 0, 5, off ],
			[ keyed ? m.bodyKeyed : m.body, I, BLACK, 0.62, 0, 0, off ],
			[ keyed ? m.plateKeyed : m.plate, I, PLATE, 0.5, 0.45, 2, off ],
			...( keyed
				? [
						[ m.wells, I, [ 0.006, 0.006, 0.007 ], 0.8, 0, 0, off ],
						...m.keys.map( ( key, k ) => [ key, move( 0, 0, -0.0018 * down[ k ] ), [ 0.034, 0.034, 0.038 ].map( ( c ) => c * ( 1 - 0.45 * down[ k ] ) ), 0.42, 0.3, 0, off ] ),
						...m.lamps.flatMap( ( part, k ) =>
							part ? [ [ part, move( 0, 0, -0.0018 * down[ k ] ), [ 0.05, 0.05, 0.05 ], 0.3, 0, 0, AMBER.map( ( c ) => ( 0.04 + 2.2 * c ) * lamps[ k ] ) ] ] : []
						),
				  ]
				: [] ),
			[ m.platter, turns, [ 0.075, 0.075, 0.08 ], 0.36, 1, 3, off ],
			[ m.mat, turns, [ 0.01, 0.01, 0.01 ], 0.9, 0, 0, off ],
			[ m.spindle, I, CHROME, 0.14, 1, 1, off ],
			[ m.lamp, I, [ 0.02, 0.02, 0.022 ], 0.4, 0.5, 0, off ],
			[ m.lens, lensM, [ 0.15, 0.05, 0.01 ], 0.3, 0, 0, [ 2.4 * on, 1.0 * on, 0.3 * on ] ],
			[ m.target, I, [ 0.03, 0.03, 0.032 ], 0.4, 0.6, 0, off ],
			[ m.targetLamp, I, [ 0.2, 0.19, 0.17 ], 0.3, 0, 0, [ 0.8 * on, 0.74 * on, 0.62 * on ] ],
			[ m.antiskate, I, [ 0.03, 0.03, 0.032 ], 0.38, 0.7, 1, off ],
			[ m.pointer, pointer, [ 0.6, 0.6, 0.6 ], 0.5, 0, 0, off ],
			[ m.tower, I, [ 0.02, 0.02, 0.022 ], 0.38, 0.6, 0, off ],
			[ m.towerCap, I, CHROME, 0.16, 1, 1, off ],
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
			const reach = Math.ceil( PLATTER * 1.01 * scale * dpr ) + 2;
			gl.enable( gl.SCISSOR_TEST );
			gl.scissor( Math.floor( ( pb.left + pb.width / 2 - cb.left ) * dpr ) - reach, Math.floor( ( cb.bottom - pb.top - pb.height / 2 ) * dpr ) - reach, 2 * reach, 2 * reach );
		}

		// The deck. It fades in and out as one: nothing of it is blended with anything else of it,
		// so each pixel is the part on top, as see-through as the deck is.
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.viewport( 0, 0, w, h );
		gl.clearColor( 0, 0, 0, 0 );
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		gl.activeTexture( gl.TEXTURE3 );
		gl.bindTexture( gl.TEXTURE_2D, tex.shadow );
		const common = ( u ) => {
			gl.uniformMatrix4fv( u.uVP, false, vp );
			gl.uniformMatrix4fv( u.uLVP, false, lvp );
			gl.uniform3fv( u.uEye, eye );
			gl.uniform1i( u.uShadow, 3 );
			gl.uniform4f( u.uLamp, ...LAMP, on );
			gl.uniform3f( u.uHand, ...handAt );
			gl.uniform4f( u.uSpot, TARGET[ 0 ], TARGET[ 1 ], 0.014, on );
		};
		let u = std.u;
		gl.useProgram( std.p );
		common( u );
		gl.uniform2f( u.uPivot, ...PIVOT );
		gl.uniform4f( u.uSleeve, ...sleeve );
		gl.uniform3fv( u.uTint, tint );
		gl.uniform1f( u.uSleeveA, sleeveShown );
		gl.uniform3fv( u.uGlowAt, GLOWS.flatMap( ( [ x, y, k ] ) => [ x, y, keyed ? lamps[ k ] : 0 ] ) );
		const front = keyed ? FRONT : BODY[ 1 ];
		gl.uniform4f( u.uBody, ( BODY[ 0 ] + BODY[ 2 ] ) / 2, ( front + BODY[ 3 ] ) / 2, ( BODY[ 2 ] - BODY[ 0 ] ) / 2, ( BODY[ 3 ] - front ) / 2 );
		gl.uniform2f( u.uStrobe, ( lampRows[ 0 ] * Math.PI ) / 180, ( lampRows[ 1 ] * Math.PI ) / 180 );
		gl.uniform1f( u.uBlur, Math.min( 1, Math.abs( speed ) / 40 ) );
		for ( const [ part, M, col, rough, metal, mode, emis, alpha ] of items ) {
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
		// Drawn: the page's own deck stops painting (riff.css).
		root.dataset.riffGl = '';
	}

	// ---- It runs while the turntable is in sight, and stops when it isn't.
	let raf = 0;
	let lost = false;
	// A listener whose system forces its own colours has the page's deck, which takes them.
	const forced = window.matchMedia( '(forced-colors: active)' );
	const active = () => ! lost && ! forced.matches && ! np.hidden && ! P.away() && root.dataset.riffTurntable !== 'off';
	function wake() {
		quiet = 0;
		if ( ! raf && active() ) {
			last = '';
			raf = requestAnimationFrame( frame );
		}
	}
	const changed = () => {
		stale = true;
		wake();
	};
	// Given up, for good: the canvas is gone, and a context that comes back is not taken up again.
	let gone = false;
	function giveUp() {
		gone = true;
		lost = true;
		delete root.dataset.riffGl;
		canvas.remove();
	}
	try {
		build();
	} catch {
		giveUp();
		return null;
	}
	canvas.addEventListener( 'webglcontextlost', ( event ) => {
		event.preventDefault();
		lost = true;
		delete root.dataset.riffGl;
	} );
	canvas.addEventListener( 'webglcontextrestored', () => {
		if ( gone ) {
			return;
		}
		try {
			build();
			lost = false;
			wake();
		} catch {
			giveUp();
		}
	} );
	// What may move something, or change what the label says: the player's own attributes and
	// colours, the record's words, the arm's place, a transition starting, a key or the pointer
	// going down or up, and the stage changing size.
	// Its own mark that it has drawn (data-riff-gl) is not news.
	new MutationObserver( ( records ) => records.some( ( r ) => r.attributeName !== 'data-riff-gl' ) && changed() ).observe( root, { attributes: true } );
	new MutationObserver( changed ).observe( record, { subtree: true, childList: true, characterData: true } );
	new MutationObserver( wake ).observe( arm, { attributes: true } );
	new MutationObserver( wake ).observe( np, { attributes: true, attributeFilter: [ 'hidden' ] } );
	for ( const moved of [ 'transitionrun', 'animationstart', 'pointerdown', 'pointerup', 'keydown', 'keyup' ] ) {
		stage.addEventListener( moved, wake, { passive: true } );
	}
	new ResizeObserver( wake ).observe( canvas );
	document.addEventListener( 'visibilitychange', wake );
	const recolour = () => {
		canvas.hidden = forced.matches;
		if ( forced.matches ) {
			delete root.dataset.riffGl;
		}
		wake();
	};
	forced.addEventListener?.( 'change', recolour );
	recolour();
	wake();
	return { wake };
}
