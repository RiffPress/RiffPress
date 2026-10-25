/**
 * The crate itself: a three.js scene of record sleeves, built from the covers the row already
 * shows. Loaded by crate.js only when it is wanted.
 */
import {
	AmbientLight,
	BoxGeometry,
	CanvasTexture,
	Color,
	DirectionalLight,
	Group,
	MathUtils,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
} from 'three';

const SLEEVE = 1; // a sleeve is a 1 by 1 square, a 12-inch record's cover
const GAP = 0.07; // the space between sleeves along the crate
const LEAN = -0.16; // how far a sleeve at rest leans back, in radians
const TIP = 0.5; // how far one already flipped leans forward, against the front of the crate

// A cover image drawn to a square canvas, so SVG covers become textures like the PNG one.
function texture( src ) {
	return new Promise( ( resolve ) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => {
			const canvas = document.createElement( 'canvas' );
			canvas.width = canvas.height = 512;
			canvas.getContext( '2d' ).drawImage( img, 0, 0, 512, 512 );
			const t = new CanvasTexture( canvas );
			t.colorSpace = SRGBColorSpace;
			resolve( t );
		};
		img.onerror = () => resolve( null );
		img.src = src;
	} );
}

export default async function crate( shelf ) {
	const sources = [ ...shelf.querySelectorAll( 'img' ) ].map(
		( img ) => img.currentSrc || img.src
	);
	const covers = await Promise.all( sources.map( texture ) );
	if ( covers.some( ( c ) => ! c ) ) {
		return; // A cover that did not load leaves the row as it is.
	}

	let renderer;
	try {
		renderer = new WebGLRenderer( { antialias: true, alpha: true } );
	} catch {
		return;
	}
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	const canvas = renderer.domElement;
	canvas.className = 'crate';
	canvas.setAttribute( 'aria-hidden', 'true' );

	const scene = new Scene();
	// Above and in front, looking down into the crate, as you stand over one in a shop.
	const camera = new PerspectiveCamera( 34, 2, 0.1, 50 );
	camera.position.set( 0, 2.35, 2.7 );
	camera.lookAt( 0, 0.22, -0.2 );
	scene.add( new AmbientLight( 0xffffff, 1.6 ) );
	const sun = new DirectionalLight( 0xffffff, 1.4 );
	sun.position.set( 1.5, 3, 2.5 );
	scene.add( sun );

	// Each sleeve hinges on its bottom edge, so it tips as a record does in a crate.
	const geometry = new BoxGeometry( SLEEVE, SLEEVE, 0.018 ).translate(
		0,
		SLEEVE / 2,
		0
	);
	const paper = new MeshStandardMaterial( {
		color: new Color( '#e9e6df' ),
		roughness: 0.9,
	} );
	const crateGroup = new Group();
	const sleeves = covers.map( ( map, i ) => {
		const front = new MeshStandardMaterial( { map, roughness: 0.75 } );
		const sleeve = new Mesh( geometry, [
			paper,
			paper,
			paper,
			paper,
			front,
			paper,
		] );
		sleeve.position.z = -i * GAP;
		sleeve.rotation.x = LEAN;
		crateGroup.add( sleeve );
		return sleeve;
	} );
	// The crate: a low wooden box the sleeves stand in.
	const wood = new MeshStandardMaterial( {
		color: new Color( '#8a5a34' ),
		roughness: 0.8,
	} );
	const depth = covers.length * GAP + 0.3;
	const side = ( w, h, d, x, y, z ) => {
		const m = new Mesh( new BoxGeometry( w, h, d ), wood );
		m.position.set( x, y, z );
		crateGroup.add( m );
	};
	side( SLEEVE + 0.16, 0.36, 0.04, 0, 0.18, 0.16 ); // front
	side( SLEEVE + 0.16, 0.36, 0.04, 0, 0.18, 0.14 - depth ); // back
	side( 0.04, 0.36, depth, -( SLEEVE / 2 + 0.06 ), 0.18, 0.15 - depth / 2 ); // left
	side( 0.04, 0.36, depth, SLEEVE / 2 + 0.06, 0.18, 0.15 - depth / 2 ); // right
	side( SLEEVE + 0.16, 0.03, depth, 0, 0.015, 0.15 - depth / 2 ); // floor
	scene.add( crateGroup );

	shelf.before( canvas );
	const section = shelf.closest( 'section' );
	section.classList.add( 'has-crate' );
	section.classList.remove( 'crate-pending' );
	requestAnimationFrame( () => canvas.classList.add( 'is-in' ) );

	// Where the dig is: 0 is the front sleeve, covers.length - 1 the last. The pointer across the
	// canvas sets it; with no pointer, scrolling the section past does.
	let target = 0;
	let at = 0;
	let running = false;
	const frame = () => {
		at = MathUtils.damp( at, target, 6, 1 / 60 );
		sleeves.forEach( ( s, i ) => {
			const flipped = MathUtils.clamp( at - i, 0, 1 );
			s.rotation.x = MathUtils.lerp(
				LEAN,
				TIP,
				MathUtils.smoothstep( flipped, 0, 1 )
			);
		} );
		renderer.render( scene, camera );
		running = Math.abs( at - target ) > 0.001;
		if ( running ) {
			requestAnimationFrame( frame );
		}
	};
	const go = ( to ) => {
		target = MathUtils.clamp( to, 0, covers.length - 1 );
		if ( ! running ) {
			running = true;
			requestAnimationFrame( frame );
		}
	};
	canvas.addEventListener( 'pointermove', ( e ) => {
		const box = canvas.getBoundingClientRect();
		go( ( ( e.clientX - box.left ) / box.width ) * ( covers.length - 1 ) );
	} );
	window.addEventListener(
		'scroll',
		() => {
			if ( ! window.matchMedia( '(hover: none)' ).matches ) {
				return;
			}
			const box = section.getBoundingClientRect();
			const through =
				1 - box.bottom / ( window.innerHeight + box.height );
			go( MathUtils.clamp( through, 0, 1 ) * ( covers.length - 1 ) );
		},
		{ passive: true }
	);

	const size = () => {
		const w = canvas.parentElement.clientWidth;
		const h = 360;
		renderer.setSize( w, h, false );
		canvas.style.height = `${ h }px`;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.render( scene, camera );
	};
	new ResizeObserver( size ).observe( canvas.parentElement );
	size();
}
