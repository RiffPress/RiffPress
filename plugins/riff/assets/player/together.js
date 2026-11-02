/* Listening together: while a signed-in listener plays, what they play is shared with the site's
 * listening room through riff/v1/together, so others see it on Home and can follow them. Shared
 * again on each play, pause, track, queue change and seek, and once a minute while it plays to stay
 * in the room. A pause is shared once and then left: the room lets a row go after a few minutes
 * without word, so whoever stops listening drops out without a request on the way out, and a
 * full-page navigation, which resumes on the next page, doesn't flicker out and back. Nothing is
 * shared by a listener who turned sharing off on their profile, or while they follow someone.
 *
 * Following keeps time as cars in a light show do. What a listener shares is a schedule: where the
 * music is at a time on the server's clock, and whether it plays from then. While someone follows
 * them, the server puts each change of theirs a moment ahead (Together::LEAD), so it reaches every
 * follower first; each follower readies it (the track loaded, the place found) and makes it when
 * it is due, by the server's clock, which they learned as NTP does; and the host's own press waits
 * for the same moment. Nothing is chased or corrected after: from then on each plays on its own,
 * at the same place. A change that reaches a follower after it was due (a locked phone's slowed
 * timers) is joined once, where the schedule says the music is by then. A press of the follower's
 * own (P.press) stops following. Loaded on demand, when the first track does, a listener follows
 * someone or picks the Together tab, and only where the room is.
 *
 * The Together tab beside Up next (Together::tab()) shows the session this listener is in: who they
 * follow and who else is with them, with Leave; or who is with them. Outside one, it shows who else
 * is listening, each with Follow. */

import { fmt, route } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );
const _n =
	window.wp?.i18n?._n ||
	( ( one, more, count ) => ( count === 1 ? one : more ) );

export default function together( P ) {
	const url = P.me?.rest?.together;
	if ( ! url ) {
		return {};
	}
	const { root, audio, video, api, own } = P;
	const MAX = 100; // As many as the route keeps.
	const STAY = 60000;
	// How often a follower asks for the host's schedule: under Together::LEAD less a round trip,
	// so a change reaches them before it is due.
	const ASK = 1000;
	const FACES = 15000; // How often a host asks who follows them.
	// How long the clock learned from the server is trusted before it is learned again: clocks
	// drift apart by a few milliseconds an hour at most.
	const CLOCK_AGE = 300000;
	// A change that finds the music already where it is due, as a track the follower's own player
	// went on to at the same moment the host's did, leaves it alone: a seek to where it is would
	// only make a click.
	const THERE = 0.05;

	const withQuery = ( u, query ) => {
		for ( const [ k, v ] of Object.entries( query ) ) {
			u.searchParams.set( k, v );
		}
		return u;
	};
	const send = ( path, method = 'GET', body = null, query = {} ) =>
		fetch( withQuery( route( url, path ), query ), {
			method,
			credentials: 'same-origin',
			headers: {
				Accept: 'application/json',
				...( body ? { 'Content-Type': 'application/json' } : {} ),
				'X-WP-Nonce': P.me.nonce,
			},
			...( body ? { body: JSON.stringify( body ) } : {} ),
		} );

	// ---- The server's clock: how far it is ahead of this one, in milliseconds, from the round
	// trip that took least time of a few, less the time the server spent answering, as NTP has it.
	// Learned when this listener follows someone or is followed, and again after CLOCK_AGE.
	const clock = () => performance.timeOrigin + performance.now();
	let offset = null;
	let learned = 0;
	const server = () => clock() + offset;
	async function learn() {
		let best = Infinity;
		for ( let i = 0; i < 4; i++ ) {
			const t0 = clock();
			const r = await send( '/clock' );
			const t1 = clock();
			if ( ! r.ok ) {
				continue;
			}
			const d = await r.json();
			const trip = t1 - t0 - ( Number( d.now ) - Number( d.received ) );
			if ( Number.isFinite( trip ) && trip < best ) {
				best = trip;
				offset = ( Number( d.received ) - t0 + ( Number( d.now ) - t1 ) ) / 2;
			}
		}
		if ( best === Infinity ) {
			throw new Error( "Riff Together: the server's clock could not be read." );
		}
		learned = clock();
	}
	async function know() {
		if ( offset === null || clock() - learned > CLOCK_AGE ) {
			await learn();
		}
	}
	// A time on the server's clock, as a delay on this one.
	const until = ( since ) => Math.max( 0, since - server() );
	// How far past its moment a change is made, in seconds: what a playing schedule has moved on by.
	const lateBy = ( plan ) =>
		Math.max( 0, ( server() - Number( plan.since ) ) / 1000 );

	// ---- Sharing.
	let timer = 0;
	let stay = 0;
	let shared = false; // A track restored paused isn't shared until it plays.
	let held = 0; // While a host's own press waits for its moment, nothing else is shared.
	function share() {
		clearTimeout( timer );
		timer = setTimeout( post, 500 ); // A track and its play arrive together.
	}
	// What is shared: the queue around the track playing, as track IDs and the posts they play
	// from, which of them plays, and where it is now, with when that was on the server's clock.
	function state() {
		const t = P.track();
		const id = Number( t?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return null;
		}
		const queue = api.queue();
		const from = Math.max( 0, Math.min( P.pos, queue.length - MAX ) );
		const items = queue
			.slice( from, from + MAX )
			.map( ( q ) => ( {
				id: Number( q?.id ),
				post: Number( q?.post?.id ) || 0,
			} ) );
		const kept = items.filter( ( q ) => Number.isInteger( q.id ) && q.id > 0 );
		return {
			queue: kept,
			index: kept.indexOf( items[ P.pos - from ] ),
			at: api.time(),
			...( offset === null ? {} : { when: Math.round( server() ) } ),
		};
	}
	// Shares it, and answers with the room, which says when the change is due and how many follow.
	async function shareNow( body ) {
		const r = await send( '', 'POST', body );
		if ( ! r.ok ) {
			return null;
		}
		const room = await r.json();
		hear( Number( room.followers ) || 0 );
		return room;
	}
	function post() {
		clearInterval( stay );
		// The listener's choice, on their profile; a follower is with someone else; and a host's
		// press waiting for its moment has already said what it will be.
		if ( ! P.me.sharing || following || held ) {
			return;
		}
		const now = state();
		const playing = api.playing();
		if ( ! now || ( ! playing && ! shared ) ) {
			return;
		}
		shared = true;
		shareNow( { ...now, playing } ).catch( () => {} ); // Shared again on the next change.
		if ( playing ) {
			stay = setInterval( post, STAY );
		}
		faces();
	}

	// ---- The host: who follows them, asked for while they share and play and shown in the bar; and
	// their own presses while followed, which wait for the moment their followers make them too.
	let followers = [];
	let followed = 0;
	let facing = 0;
	function faces() {
		clearTimeout( facing );
		if ( ! P.me.sharing || following || ! api.playing() ) {
			return;
		}
		send( '/following' )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( d ) => {
				const now = Array.isArray( d?.following ) ? d.following : [];
				hear( now.length );
				if ( JSON.stringify( now ) !== JSON.stringify( followers ) ) {
					followers = now;
					refresh();
				}
			} )
			.catch( () => {} ); // Asked again in a moment.
		facing = setTimeout( faces, FACES );
	}
	// How many follow, and the server's clock learned once someone does.
	function hear( count ) {
		followed = count;
		if ( followed ) {
			// eslint-disable-next-line no-console
			know().catch( ( e ) => console.error( e ) );
		}
	}
	let pressed = false;
	own.press.add( () => {
		if ( following ) {
			stop(
				/* translators: %s: The listener's name. */
				__( 'You stopped following %s.', 'riff' ),
				true
			);
			return;
		}
		// The start or stop this press makes, which the player asks about (P.holds) as it acts.
		pressed = true;
		queueMicrotask( () => ( pressed = false ) );
	} );
	own.hold.add( ( m, start ) => {
		if (
			! pressed ||
			following ||
			! followed ||
			offset === null ||
			! P.me.sharing
		) {
			return false;
		}
		pressed = false;
		hold( m, start );
		return true;
	} );
	// A host's press while followed: shared now, made when it is due. A start waits where it is;
	// a stop lets the music play on until then. Without an answer, it is made at once.
	async function hold( m, start ) {
		const now = state();
		if ( ! now ) {
			return;
		}
		clearTimeout( timer );
		clearTimeout( held );
		held = -1;
		shared = true;
		P.paint();
		const room = await shareNow( {
			...now,
			playing: start,
			running: ! start,
		} ).catch( () => null );
		const plan = room?.scheduled;
		held = setTimeout(
			() => {
				held = 0;
				if ( P.el() !== m ) {
					return;
				}
				if ( plan ) {
					m.currentTime = Number( plan.at ) + ( start ? lateBy( plan ) : 0 );
				}
				if ( start ) {
					m.play().catch( P.paint );
				} else {
					m.pause();
				}
				P.paint();
				share();
			},
			plan ? until( Number( plan.since ) ) : 0
		);
	}

	// ---- Following.
	let following = null; // { user, name, version, queue, plan, made }
	let asking = 0;
	let due = 0;
	let inFlight = false;

	const sameTrack = ( plan ) =>
		String( P.track()?.id ) === String( plan.track?.id );
	// Where the schedule says the music is now: where it is when due, and since then if it plays.
	const target = ( plan ) =>
		Number( plan.at ) + ( plan.playing ? lateBy( plan ) : 0 );

	// A change of the host's, readied at once and made when it is due: one timer, whatever it is.
	function arrange( plan ) {
		clearTimeout( due );
		const wait = until( Number( plan.since ) );
		if ( wait > 0 && ! sameTrack( plan ) ) {
			// Their next track, loaded and its place found, before it is due.
			P.setQueue( following.queue, plan.index, {
				play: false,
				at: Number( plan.at ),
			} );
		}
		due = setTimeout( () => make( plan ), wait );
	}
	function make( plan ) {
		if ( ! following ) {
			return;
		}
		if ( ! sameTrack( plan ) ) {
			P.setQueue( following.queue, plan.index, { play: false } );
		}
		const m = P.el();
		const to = target( plan );
		const playing = ! m.paused && ! m.ended;
		if (
			Math.abs( m.currentTime - to ) > THERE ||
			playing !== plan.playing
		) {
			m.currentTime = to;
		}
		if ( plan.playing && ! playing ) {
			m.play().catch( P.paint );
		} else if ( ! plan.playing && playing ) {
			m.pause();
		}
		P.paint();
	}

	async function ask() {
		if ( ! following || inFlight ) {
			return;
		}
		inFlight = true;
		const user = following.user;
		let r;
		try {
			await know();
			r = await send( `/${ user }/follow`, 'POST', {
				version: following.version || '',
			} );
		} catch {
			return; // The network: asked again on the next tick.
		} finally {
			inFlight = false;
		}
		if ( following?.user !== user ) {
			return;
		}
		if ( r.status === 404 ) {
			stop(
				/* translators: %s: The listener's name. */
				__( '%s stopped sharing what they play.', 'riff' ),
				false
			);
			return;
		}
		if ( ! r.ok ) {
			return; // Asked again on the next tick.
		}
		const d = await r.json();
		if ( following?.user !== user ) {
			return; // Left while the answer was read.
		}
		// Who they are and who else is with them, for the Together tab.
		following.name = following.name || String( d.user?.name || '' );
		following.face = String( d.user?.face || '' );
		following.with = Array.isArray( d.with ) ? d.with : [];
		draw();
		if ( Array.isArray( d.queue ) ) {
			following.queue = d.queue;
			following.version = d.version;
		}
		if ( ! following.queue ) {
			return;
		}
		const plan = {
			track: d.track,
			index: Number( d.index ) || 0,
			at: Number( d.at ) || 0,
			since: Number( d.since ) || 0,
			playing: !! d.playing,
		};
		const key = JSON.stringify( [
			plan.track?.id,
			plan.index,
			plan.at,
			plan.since,
			plan.playing,
		] );
		following.plan = plan;
		if ( key !== following.made ) {
			following.made = key;
			arrange( plan );
		}
	}

	async function follow( user, name = '' ) {
		const id = Number( user );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return false;
		}
		if ( following ) {
			stop( '', false );
		}
		again = null;
		following = {
			user: id,
			name: String( name ),
			face: '',
			with: [],
			version: '',
			queue: null,
			plan: null,
			made: '',
		};
		// Out of the room while with someone else: the follower is listening to them.
		if ( shared ) {
			shared = false;
			send( '', 'DELETE' ).catch( () => {} ); // The row runs out on its own if this is lost.
		}
		await ask();
		if ( ! following?.plan ) {
			following = null;
			refresh();
			return false;
		}
		asking = setInterval( ask, ASK );
		refresh();
		P.toast(
			fmt(
				/* translators: %s: The listener's name. */
				__(
					'Following %s, who sees you’re with them. While your screen is locked, their changes reach you late.',
					'riff'
				),
				following.name
			)
		);
		return true;
	}

	// Who was followed, for Follow again.
	let again = null;
	function stop( message = '', offerAgain = false ) {
		if ( ! following ) {
			return;
		}
		const { user, name } = following;
		following = null;
		clearInterval( asking );
		clearTimeout( due );
		send( `/${ user }/follow`, 'DELETE' ).catch( () => {} ); // Their session lets the row go.
		again = offerAgain ? { user, name } : null;
		if ( message ) {
			P.toast( fmt( message, name ) );
		}
		refresh();
		share();
	}

	// A locked phone or a hidden tab has its timers slowed: on coming back, ask at once.
	document.addEventListener( 'visibilitychange', () => {
		if ( ! document.hidden && following ) {
			ask();
		}
		if ( ! document.hidden ) {
			askRoom();
		}
	} );

	// ---- The Together tab: the session, or outside one, who else is listening.
	const TAB = 'together';
	const ROOM = 15000; // How often the room is asked for while the tab shows it, as Home does.
	let room = [];
	let roomVersion = null;
	let roomTimer = 0;
	let roomTurn = 0; // The latest ask, so only one goes on asking.
	let drawn = '';
	const panel = () => root.querySelector( `[data-riff-panel="${ TAB }"]` );
	const np = root.querySelector( '.riff-np' );
	// The tab picked, in Now Playing while it is open.
	const showing = () => panel()?.hidden === false && np?.hidden === false;
	// Their face, or a person where they have none.
	function face( src ) {
		const span = document.createElement( 'span' );
		span.className = 'riff-together-face';
		span.innerHTML =
			'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
		if ( src ) {
			const img = document.createElement( 'img' );
			img.alt = '';
			img.loading = 'lazy';
			img.addEventListener( 'error', () => img.remove(), { once: true } );
			img.src = src;
			span.append( img );
		}
		return span;
	}
	function person( { name, face: src, sub = '' }, action = null ) {
		const li = document.createElement( 'li' );
		li.className = 'riff-together-person';
		li.append( face( src ) );
		const text = document.createElement( 'span' );
		text.className = 'riff-together-text';
		const who = document.createElement( 'span' );
		who.className = 'riff-together-name';
		who.textContent = name;
		text.append( who );
		if ( sub ) {
			const what = document.createElement( 'span' );
			what.className = 'riff-together-sub';
			what.textContent = sub;
			text.append( what );
		}
		li.append( text );
		if ( action ) {
			li.append( action );
		}
		return li;
	}
	function button( text, label, run ) {
		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'riff-together-button';
		b.textContent = text;
		if ( label ) {
			b.setAttribute( 'aria-label', label );
		}
		b.addEventListener( 'click', run );
		return b;
	}
	// What the tab shows: drawn again only when that changes, so a button keeps its focus.
	function draw() {
		const into = panel();
		if ( ! into || into.hidden ) {
			return;
		}
		const people = following
			? [
					{
						id: following.user,
						name: following.name,
						face: following.face,
						sub: __( 'Choosing the music', 'riff' ),
					},
					...following.with,
			  ]
			: followers.length
			? followers
			: room.map( ( l ) => ( {
					id: l.user.id,
					name: l.user.name,
					face: l.user.face,
					sub: [ l.track?.title, l.track?.artist ]
						.filter( Boolean )
						.join( ' · ' ),
			  } ) );
		// Who is shown, without what they play: a listener moving on to their next track changes
		// only that line, in place, so a button keeps its focus.
		const key = JSON.stringify( [
			following?.user || 0,
			followers.length,
			people.map( ( p ) => [ p.id, p.name, p.face ] ),
		] );
		if ( key === drawn ) {
			into.querySelectorAll( '.riff-together-person' ).forEach( ( li, i ) => {
				const sub = li.querySelector( '.riff-together-sub' );
				if ( sub && people[ i ]?.sub && sub.textContent !== people[ i ].sub ) {
					sub.textContent = people[ i ].sub;
				}
			} );
			return;
		}
		const had = into.contains( document.activeElement );
		drawn = key;
		const box = document.createElement( 'div' );
		box.className = 'riff-together';
		const head = document.createElement( 'h3' );
		head.className = 'riff-together-head';
		const list = document.createElement( 'ul' );
		list.className = 'riff-together-list';
		if ( following ) {
			head.textContent = fmt(
				/* translators: %s: The listener's name. */
				__( 'Following %s', 'riff' ),
				following.name
			);
			for ( const p of people ) {
				list.append( person( p ) );
			}
			box.append(
				head,
				list,
				button( __( 'Leave', 'riff' ), '', () =>
					stop(
						/* translators: %s: The listener's name. */
						__( 'You stopped following %s.', 'riff' ),
						false
					)
				)
			);
		} else if ( followers.length ) {
			head.textContent = __( 'Listening with you', 'riff' );
			for ( const p of people ) {
				list.append( person( p ) );
			}
			box.append( head, list );
		} else {
			head.textContent = __( 'Listening now', 'riff' );
			box.append( head );
			for ( const p of people ) {
				list.append(
					person(
						p,
						button(
							__( 'Follow', 'riff' ),
							fmt(
								/* translators: %s: The listener's name. */
								__( 'Follow %s', 'riff' ),
								p.name
							),
							async () => {
								if ( ! ( await follow( p.id, p.name ) ) ) {
									P.toast(
										__(
											'They have stopped listening, or to something you can’t hear.',
											'riff'
										)
									);
									askRoom();
								}
							}
						)
					)
				);
			}
			if ( people.length ) {
				box.append( list );
			} else {
				const none = document.createElement( 'p' );
				none.className = 'riff-together-none';
				none.textContent = __(
					'No one else is listening right now. When someone is, you can follow them here and hear what they play as they play it.',
					'riff'
				);
				box.append( none );
			}
		}
		into.replaceChildren( box );
		// A press that changed what the tab shows leaves the focus in it.
		if ( had && ! into.contains( document.activeElement ) ) {
			into.focus();
		}
	}
	// Who else is listening, while the tab shows it and the page is in view.
	async function askRoom() {
		clearTimeout( roomTimer );
		const mine = ++roomTurn;
		if ( ! showing() || following || followers.length || document.hidden ) {
			return;
		}
		try {
			// With the version it last had, so a room where nothing changed costs a lookup.
			const r = await send(
				'',
				'GET',
				null,
				roomVersion ? { version: roomVersion } : {}
			);
			if ( r.ok ) {
				const d = await r.json();
				roomVersion = d.version ?? null;
				if ( d.changed !== false ) {
					room = Array.isArray( d.listeners ) ? d.listeners : [];
				}
			}
		} catch {
			// Asked again in a moment.
		}
		if ( mine !== roomTurn ) {
			return;
		}
		draw();
		roomTimer = setTimeout( askRoom, ROOM );
	}
	function refresh() {
		P.areas?.();
		draw();
		askRoom();
	}
	root.addEventListener( 'riff:tab', ( e ) => {
		if ( e.detail?.id === TAB ) {
			drawn = '';
			draw();
			askRoom();
		}
	} );
	// Now Playing opened again on the tab: asked again, as it stopped asking while closed.
	if ( np && typeof MutationObserver === 'function' ) {
		new MutationObserver( () => {
			if ( showing() ) {
				draw();
				askRoom();
			}
		} ).observe( np, { attributes: true, attributeFilter: [ 'hidden' ] } );
	}
	// Picked before this loaded.
	if ( showing() ) {
		draw();
		askRoom();
	}

	// ---- The bar: who the follower is with, and the way out; or who is with the host.
	own.badges.add( ( list ) => {
		if ( following ) {
			return [
				...list,
				{
					id: 'following',
					text: fmt(
						/* translators: %s: The listener's name. */
						__( 'With %s', 'riff' ),
						following.name
					),
					label: fmt(
						/* translators: %s: The listener's name. */
						__( 'Following %s', 'riff' ),
						following.name
					),
				},
			];
		}
		if ( followers.length ) {
			const names = followers.map( ( f ) => f.name );
			return [
				...list,
				{
					id: 'followers',
					text:
						names.length === 1
							? fmt(
									/* translators: %s: A listener's name. */
									__( '%s with you', 'riff' ),
									names[ 0 ]
							  )
							: fmt(
									/* translators: %s: How many listeners, two or more. */
									_n(
										'%s with you',
										'%s with you',
										names.length,
										'riff'
									),
									String( names.length )
							  ),
					label: fmt(
						/* translators: %s: Listeners' names, separated by commas. */
						__( 'Listening with you: %s', 'riff' ),
						names.join( ', ' )
					),
				},
			];
		}
		return list;
	} );
	own.controls.add( ( list ) => {
		if ( following ) {
			return [
				...list,
				{
					id: 'unfollow',
					label: fmt(
						/* translators: %s: The listener's name. */
						__( 'Stop following %s', 'riff' ),
						following.name
					),
					icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.3 5.71 12 12.01l-6.3-6.3-1.4 1.41 6.29 6.3-6.3 6.29 1.42 1.42 6.29-6.3 6.3 6.3 1.41-1.42-6.29-6.3 6.29-6.29z"/></svg>',
					run: () => stop( '', false ),
				},
			];
		}
		if ( again ) {
			const { user, name } = again;
			return [
				...list,
				{
					id: 'follow-again',
					label: fmt(
						/* translators: %s: The listener's name. */
						__( 'Follow %s again', 'riff' ),
						name
					),
					icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
					run: () => follow( user, name ),
				},
			];
		}
		return list;
	} );

	for ( const name of [ 'play', 'pause', 'track', 'queue' ] ) {
		root.addEventListener( `riff:${ name }`, share );
	}
	for ( const m of [ audio, video ] ) {
		m.addEventListener( 'seeked', share );
	}
	share();
	return {
		follow,
		unfollow: () => stop( '', false ),
		// For the tests: who is followed, and how far this player is from where the host's schedule
		// says the music is now, once the change it is on was due.
		following: () =>
			following?.plan
				? {
						user: following.user,
						due: until( following.plan.since ) === 0,
						off: api.time() - target( following.plan ),
				  }
				: null,
	};
}
