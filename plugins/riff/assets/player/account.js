/* Likes, what was played, and playlists. A signed-in listener's live in their account: the page
 * hands them over in data.me, and each change is sent to riff/v1/users/me/likes, /users/me/history
 * or /users/me/playlists. A visitor's likes and history stay in this browser. The first page a
 * listener opens after signing in sends what this browser kept to the account and forgets it here,
 * so a shared computer keeps nothing of theirs once they sign out. */
import { fmt, parse, read, write, drop } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function account( P ) {
	const { data, me, $, $$ } = P;
	const HISTORY = 'riff-history';
	const LIKES = 'riff-likes';
	const KINDS = [ 'track', 'album', 'artist' ];
	const keyOf = ( kind, id ) => `${ kind }:${ Number( id ) }`;
	function cleanLikes( list ) {
		const seen = new Set();
		return ( Array.isArray( list ) ? list : [] )
			.map( ( l ) => ( {
				kind: l?.kind,
				id: Number( l?.id ),
				at: Number( l?.at ) || 0,
			} ) )
			.filter( ( l ) => {
				const key = keyOf( l.kind, l.id );
				if (
					! KINDS.includes( l.kind ) ||
					! Number.isInteger( l.id ) ||
					l.id <= 0 ||
					seen.has( key )
				) {
					return false;
				}
				seen.add( key );
				return true;
			} )
			.sort( ( a, b ) => b.at - a.at );
	}
	const deviceLikes = () =>
		cleanLikes( parse( read( localStorage, LIKES ) ) );
	P.likes = me ? cleanLikes( me.likes ) : deviceLikes();
	let likeSet = new Set();
	const indexLikes = () =>
		( likeSet = new Set( P.likes.map( ( l ) => keyOf( l.kind, l.id ) ) ) );
	indexLikes();
	const isLiked = ( id, kind = 'track' ) => likeSet.has( keyOf( kind, id ) );
	// What can be liked, or kept in an account's history: an audio file in the Media Library, whose
	// ID is the same wherever it plays.
	const inLibrary = ( t ) =>
		!! t &&
		t.type === 'audio' &&
		! t.locked &&
		/^\d+$/.test( String( t.id ) );

	function deviceHistory() {
		const list = parse( read( localStorage, HISTORY ) );
		return Array.isArray( list ) ? list : [];
	}
	let accountHistory = null;
	if ( me ) {
		accountHistory = Array.isArray( me.history ) ? me.history : [];
	}
	function played() {
		return accountHistory || deviceHistory();
	}
	// The riff_history cookie tells the server that this browser keeps a history, so the Listen
	// page's Home can hold room for it before this script runs: 2 when a track was played from a
	// post, for Jump back in too, 1 when not. It says nothing about what was played, and is there
	// only while there is something to say. A signed-in listener's history is their account's.
	function hint() {
		const list = me ? [] : deviceHistory();
		let value = '';
		if ( list.length ) {
			value = list.some( ( t ) => t?.post?.id ) ? '2' : '1';
		}
		try {
			const now =
				( document.cookie.match( /(?:^|;\s*)riff_history=(\d)/ ) ||
					[] )[ 1 ] || '';
			if ( value === now ) {
				return;
			}
			const scope = `path=${ data.cookiePath || '/' }; SameSite=Lax${
				location.protocol === 'https:' ? '; Secure' : ''
			}`;
			document.cookie = value
				? `riff_history=${ value }; max-age=31536000; ${ scope }`
				: `riff_history=; max-age=0; ${ scope }`;
		} catch {
			// A sandboxed frame has no cookies; Home then fills its rows without held room.
		}
	}
	hint();
	function remember( t ) {
		// Without the level envelope, which can be long and only the cover drawn on the server reads.
		const { levels, ...kept } = t;
		const entry = { ...kept, played: Date.now() };
		const list = [
			entry,
			...played().filter( ( p ) => p.id !== t.id ),
		].slice( 0, 30 );
		if ( ! accountHistory ) {
			write( localStorage, HISTORY, JSON.stringify( list ) );
			hint();
			return;
		}
		accountHistory = list;
		if ( inLibrary( t ) ) {
			send(
				me.rest.history,
				'POST',
				{
					items: [
						{
							id: Number( t.id ),
							played: entry.played,
							post: Number( t.post?.id ) || 0,
						},
					],
				},
				true
			).catch( () => {} );
		}
	}

	// A request to the account's routes, with the nonce that tells WordPress the cookie is the
	// listener's. A route's address takes a path whether or not the site has pretty permalinks.
	function under( base, path ) {
		const u = new URL( base, location.href );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set(
				'rest_route',
				u.searchParams.get( 'rest_route' ) + path
			);
		} else {
			u.pathname = u.pathname.replace( /\/?$/, path );
		}
		return u.toString();
	}
	// One at a time: the server reads the list, changes it and writes it back, so two requests at
	// once would each write over the other's change.
	let sending = Promise.resolve();
	function send( url, method, body, keepalive = false ) {
		const run = () =>
			fetch( url, {
				method,
				credentials: 'same-origin',
				keepalive,
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'X-WP-Nonce': me.nonce,
				},
				body: body ? JSON.stringify( body ) : undefined,
			} ).then( ( r ) =>
				r.ok
					? r.json()
					: Promise.reject( new Error( String( r.status ) ) )
			);
		const sent = sending.then( run, run );
		sending = sent.catch( () => {} );
		return sent;
	}

	function setLike( id, kind, on ) {
		id = Number( id );
		if (
			! KINDS.includes( kind ) ||
			! Number.isInteger( id ) ||
			id <= 0 ||
			isLiked( id, kind ) === on
		) {
			return;
		}
		const flip = ( yes ) => {
			P.likes = yes
				? [ { kind, id, at: Date.now() }, ...P.likes ]
				: P.likes.filter(
						( l ) => ! ( l.kind === kind && l.id === id )
					);
			likesChanged( yes ? 'like' : 'unlike', kind, id );
		};
		flip( on );
		if ( ! me ) {
			write( localStorage, LIKES, JSON.stringify( P.likes ) );
			return;
		}
		const sent = on
			? send( me.rest.likes, 'POST', { items: [ { kind, id } ] } )
			: send( under( me.rest.likes, `/${ kind }/${ id }` ), 'DELETE' );
		sent.catch( () => {
			// Only this like goes back; anything changed since stays as it is.
			if ( isLiked( id, kind ) === on ) {
				flip( ! on );
			}
			P.toast( __( 'That could not be saved. Try again.', 'riff' ) );
		} );
	}
	function likesChanged( change, kind = null, id = null ) {
		indexLikes();
		paintHearts();
		P.tell( 'like', { change, kind, id } );
	}
	function toggleLike( t ) {
		const on = ! isLiked( t.id );
		setLike( t.id, 'track', on );
		P.toast(
			fmt(
				on
					? /* translators: %s: track title. */ __(
							'%s added to Liked songs',
							'riff'
						)
					: /* translators: %s: track title. */ __(
							'%s removed from Liked songs',
							'riff'
						),
				t.title
			)
		);
	}

	// ---- Hearts: in the bar, in Now Playing and on each row of a track in the Media Library. A
	// heart is a toggle button, pressed while the track is liked.
	// The heart's two icons, copied from the bar's, which the server drew (Player::hearts()). Cloned
	// as nodes, so no markup is parsed here.
	const HEARTS = [ ...( $( '[data-riff-action="like"]' )?.children || [] ) ];
	function likeButton( t ) {
		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'riff-like-button';
		b.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: a track, album or artist. */ __(
					'Like %s',
					'riff'
				),
				t.title
			)
		);
		b.setAttribute( 'aria-pressed', String( isLiked( t.id ) ) );
		b.append( ...HEARTS.map( ( icon ) => icon.cloneNode( true ) ) );
		b.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			toggleLike( t );
		} );
		return b;
	}
	function paintHearts() {
		const t = P.track();
		const can = inLibrary( t );
		for ( const b of $$( '[data-riff-action="like"]' ) ) {
			b.hidden = ! can;
			b.setAttribute( 'aria-pressed', String( can && isLiked( t.id ) ) );
			// Named for the track, as a row's heart is, since focus can reach it from anywhere.
			b.setAttribute(
				'aria-label',
				t
					? fmt(
							/* translators: %s: a track, album or artist. */ __(
								'Like %s',
								'riff'
							),
							t.title
						)
					: __( 'Like', 'riff' )
			);
		}
		for ( const { t: rt, row } of P.rows ) {
			P.rowHearts
				.get( row )
				?.setAttribute( 'aria-pressed', String( isLiked( rt.id ) ) );
		}
	}

	// ---- Playlists. A playlist is a post, so it belongs to an account: the page hands the
	// signed-in listener's over in data.me, and each change goes to riff/v1/users/me/playlists.
	P.playlists = Array.isArray( me?.playlists ) ? me.playlists : [];
	const trackIds = ( tracks ) =>
		( Array.isArray( tracks ) ? tracks : [ tracks ] )
			.map( ( t ) => Number( t && typeof t === 'object' ? t.id : t ) )
			.filter( ( n ) => Number.isInteger( n ) && n > 0 );
	function playlistCall( change, method, path, body ) {
		if ( ! me?.rest?.playlists ) {
			return Promise.reject( new Error( 'signed out' ) );
		}
		return send( under( me.rest.playlists, path ), method, body ).then(
			( r ) => {
				const p = r.previous || r;
				const brief = { id: p.id, title: p.title, count: p.count };
				P.playlists =
					change === 'delete'
						? P.playlists.filter( ( x ) => x.id !== brief.id )
						: [
								brief,
								...P.playlists.filter(
									( x ) => x.id !== brief.id
								),
							];
				P.tell( 'playlist', { change, playlist: brief } );
				return r;
			}
		);
	}
	// The list Add to playlist opens: a new playlist named after the track, then each one.
	function playlistItems( t ) {
		const said = ( p ) =>
			P.toast(
				fmt(
					/* translators: %s: playlist name. */ __(
						'Added to %s',
						'riff'
					),
					p.title
				)
			);
		const failed = () =>
			P.toast(
				__( 'The playlist could not be changed. Try again.', 'riff' )
			);
		return [
			{
				id: 'new-playlist',
				label: __( 'New playlist', 'riff' ),
				run: () =>
					P.internal
						.createPlaylist( t.title, [ t ] )
						.then( said, failed ),
			},
			...P.playlists.map( ( p ) => ( {
				id: `playlist-${ p.id }`,
				label: p.title,
				run: () =>
					P.internal
						.addToPlaylist( p.id, [ t ] )
						.then( said, failed ),
			} ) ),
		];
	}

	// Signed in, with likes or plays this browser kept from before: they join the account. What
	// they add shows at once; the browser forgets its copy once the account has it.
	function join() {
		if ( ! me ) {
			return;
		}
		const device = deviceLikes();
		if ( device.length ) {
			const had = new Set( likeSet );
			P.likes = cleanLikes( [
				...P.likes,
				...device.filter( ( l ) => ! had.has( keyOf( l.kind, l.id ) ) ),
			] );
			indexLikes();
			send( me.rest.likes, 'POST', { items: device } )
				.then( () => {
					drop( localStorage, LIKES );
					likesChanged( 'sync' );
				} )
				.catch( () => {} );
		}
		const plays = deviceHistory().filter( ( t ) => t?.id !== undefined );
		if ( ! plays.length ) {
			return;
		}
		const seen = new Set();
		accountHistory = [ ...plays, ...accountHistory ]
			.sort(
				( a, b ) =>
					( Number( b.played ) || 0 ) - ( Number( a.played ) || 0 )
			)
			.filter( ( t ) => ! seen.has( t.id ) && seen.add( t.id ) )
			.slice( 0, 30 );
		const items = plays
			.filter( inLibrary )
			.slice( 0, 30 )
			.map( ( t ) => ( {
				id: Number( t.id ),
				played: Number( t.played ) || 0,
				post: Number( t.post?.id ) || 0,
			} ) );
		( items.length
			? send( me.rest.history, 'POST', { items } )
			: Promise.resolve()
		)
			.then( () => drop( localStorage, HISTORY ) )
			.catch( () => {} );
	}

	return {
		isLiked,
		inLibrary,
		played,
		remember,
		under,
		send,
		setLike,
		toggleLike,
		likeButton,
		paintHearts,
		trackIds,
		playlistCall,
		playlistItems,
		join,
	};
}
