/* Search. The form works as a plain GET without the script; with it, the results swap in. And
 * search as you type: a list under the field of the best match, then songs, albums and artists, from
 * the same routes the results page reads; recent searches while it is empty. The field is a
 * combobox: arrow keys move through the list, Enter opens or plays the one chosen, or with nothing
 * chosen loads the full results page as before. Each answer is numbered, so a slow one can never
 * replace a newer one. */
import { esc, fmt } from 'riff-app/helpers';

export function search( ctx ) {
	const { api, app, nav, tracksRest, browseArgs, __, _n } = ctx;

	app.addEventListener( 'submit', ( e ) => {
		const form = e.target.closest( '.riff-app-search' );
		if ( ! form ) {
			return;
		}
		const u = new URL( form.action, location.href );
		new FormData( form ).forEach( ( value, key ) =>
			u.searchParams.set( key, String( value ) )
		);
		const to = ctx.postOf( u.toString() );
		if ( to?.browse ) {
			e.preventDefault();
			ctx.show( to ).catch( () => {} );
		}
	} );

	const SEARCHES = 'riff-searches';
	const recentSearches = () => {
		try {
			const list = JSON.parse( localStorage.getItem( SEARCHES ) || '[]' );
			return Array.isArray( list )
				? list.filter( ( q ) => typeof q === 'string' )
				: [];
		} catch {
			return [];
		}
	};
	const rememberSearch = ( q ) => {
		const words = q.trim();
		if ( ! words ) {
			return;
		}
		try {
			localStorage.setItem(
				SEARCHES,
				JSON.stringify(
					[
						words,
						...recentSearches().filter( ( x ) => x !== words ),
					].slice( 0, 6 )
				)
			);
		} catch {}
	};
	// A route beside /tracks: /albums or /artists, with its arguments, pretty permalinks or not.
	const catalog = ( name, params ) => {
		const u = new URL( tracksRest, location.href );
		if ( u.searchParams.has( 'rest_route' ) ) {
			u.searchParams.set(
				'rest_route',
				u.searchParams
					.get( 'rest_route' )
					.replace( /\/tracks$/, '/' + name )
			);
		} else {
			u.pathname = u.pathname.replace( /\/tracks\/?$/, '/' + name );
		}
		Object.entries( params ).forEach( ( [ k, v ] ) =>
			u.searchParams.set( k, String( v ) )
		);
		return u.toString();
	};
	// How well a name answers the words: the whole name, its start, a word in it, anywhere in it.
	const score = ( name, q ) => {
		const n = String( name || '' ).toLowerCase();
		const w = q.toLowerCase();
		if ( n === w ) {
			return 4;
		}
		if ( n.startsWith( w ) ) {
			return 3;
		}
		if (
			n.split( /[\s,.\-–]+/ ).some( ( part ) => part.startsWith( w ) )
		) {
			return 2;
		}
		return n.includes( w ) ? 1 : 0;
	};

	const searchForm = () => nav?.querySelector( '.riff-app-search' );
	let suggestTurn = 0;
	let suggestTimer = 0;
	let options = [];
	let active = -1;
	const panel = document.createElement( 'div' );
	panel.className = 'riff-suggest';
	panel.id = 'riff-suggest';
	panel.hidden = true;
	const said = document.createElement( 'p' );
	said.className = 'riff-app-sr';
	said.setAttribute( 'role', 'status' );

	function wireSearch() {
		const form = searchForm();
		const field = form?.querySelector( 'input[type="search"]' );
		if ( ! field || field.dataset.riffSuggest ) {
			return;
		}
		field.dataset.riffSuggest = '1';
		field.setAttribute( 'role', 'combobox' );
		field.setAttribute( 'aria-autocomplete', 'list' );
		field.setAttribute( 'aria-expanded', 'false' );
		field.setAttribute( 'aria-controls', panel.id );
		field.setAttribute( 'autocomplete', 'off' );
		// On the app's root, not in the sidebar, whose own stacking would put the view over it.
		app.append( panel, said );
		field.addEventListener( 'input', () => {
			clearTimeout( suggestTimer );
			suggestTimer = setTimeout( () => suggest( field ), 100 );
		} );
		field.addEventListener( 'focus', () => suggest( field ) );
		field.addEventListener( 'keydown', ( e ) => keys( e, field ) );
		field.addEventListener( 'blur', () =>
			setTimeout( () => {
				if ( ! form.contains( document.activeElement ) ) {
					closeSuggest( field );
				}
			}, 150 )
		);
		form.addEventListener( 'submit', () => rememberSearch( field.value ) );
	}

	function closeSuggest( field ) {
		panel.hidden = true;
		panel.replaceChildren();
		options = [];
		active = -1;
		field?.setAttribute( 'aria-expanded', 'false' );
		field?.removeAttribute( 'aria-activedescendant' );
	}

	async function suggest( field ) {
		const q = field.value.trim();
		const turn = ++suggestTurn;
		if ( ! q ) {
			const recent = recentSearches();
			if ( ! recent.length ) {
				closeSuggest( field );
				return;
			}
			draw(
				field,
				[
					{
						label: __( 'Recent searches', 'riff' ),
						items: recent.map( ( words ) => ( {
							kind: 'recent',
							title: words,
							run: () => runSearch( field, words ),
						} ) ),
					},
				],
				''
			);
			return;
		}
		let answers;
		try {
			answers = await Promise.all( [
				api
					.request( catalog( 'tracks', { search: q, per_page: 5 } ) )
					.then( ( r ) => r.json() ),
				api
					.request( catalog( 'albums', { search: q } ) )
					.then( ( r ) => r.json() ),
				api
					.request( catalog( 'artists', { search: q } ) )
					.then( ( r ) => r.json() ),
			] );
		} catch {
			return;
		}
		if ( turn !== suggestTurn || field.value.trim() !== q ) {
			return;
		}
		const [ tracks, albums, artists ] = answers.map( ( a ) =>
			Array.isArray( a?.items ) ? a.items : []
		);
		const played = tracks.slice( 0, 4 );
		const songs = played.map( ( t, i ) => ( {
			kind: 'track',
			title: t.title,
			sub: t.artist,
			art: t.art,
			run: () => {
				rememberSearch( q );
				closeSuggest( field );
				api.play( played, i );
			},
		} ) );
		const albumItems = albums.slice( 0, 3 ).map( ( a ) => ( {
			kind: 'album',
			title: a.name,
			sub: a.artist || '',
			art: a.art,
			href: ctx.browseHref( browseArgs[ 1 ] || 'riff_album', a.id ),
		} ) );
		const artistItems = artists.slice( 0, 3 ).map( ( a ) => ( {
			kind: 'artist',
			title: a.name,
			sub: __( 'Artist', 'riff' ),
			href: ctx.browseHref( browseArgs[ 2 ] || 'riff_artist', a.id ),
		} ) );
		// The best match across all three; on a tie an artist, then an album, then a song.
		const top = [ ...artistItems, ...albumItems, ...songs ]
			.map( ( o ) => ( { o, n: score( o.title, q ) } ) )
			.sort( ( x, y ) => y.n - x.n )[ 0 ];
		const groups = [];
		if ( top?.n ) {
			groups.push( {
				label: __( 'Top result', 'riff' ),
				items: [ { ...top.o, top: true } ],
			} );
		}
		const besides = ( list ) => list.filter( ( o ) => o !== top?.o );
		if ( besides( songs ).length ) {
			groups.push( {
				label: __( 'Songs', 'riff' ),
				items: besides( songs ),
			} );
		}
		if ( besides( albumItems ).length ) {
			groups.push( {
				label: __( 'Albums', 'riff' ),
				items: besides( albumItems ),
			} );
		}
		if ( besides( artistItems ).length ) {
			groups.push( {
				label: __( 'Artists', 'riff' ),
				items: besides( artistItems ),
			} );
		}
		groups.push( {
			label: '',
			items: [
				{
					kind: 'all',
					title: fmt(
						/* translators: %s: the words searched for. */ __(
							'All results for “%s”',
							'riff'
						),
						q
					),
					run: () => runSearch( field, q ),
				},
			],
		} );
		draw( field, groups, q );
	}

	function runSearch( field, words ) {
		field.value = words;
		closeSuggest( field );
		searchForm()?.requestSubmit();
	}

	function draw( field, groups, q ) {
		panel.replaceChildren();
		options = [];
		active = -1;
		groups.forEach( ( g, gi ) => {
			const list = document.createElement( 'div' );
			list.setAttribute( 'role', g.label ? 'group' : 'presentation' );
			if ( g.label ) {
				const h = document.createElement( 'p' );
				h.className = 'riff-suggest-head';
				h.id = `riff-suggest-g${ gi }`;
				h.textContent = g.label;
				list.setAttribute( 'aria-labelledby', h.id );
				list.append( h );
			}
			g.items.forEach( ( o ) => {
				const el = document.createElement( o.href ? 'a' : 'div' );
				el.className =
					'riff-suggest-option' +
					( o.top ? ' riff-suggest-top' : '' ) +
					` riff-suggest-${ o.kind }`;
				el.id = `riff-suggest-o${ options.length }`;
				el.setAttribute( 'role', 'option' );
				el.setAttribute( 'aria-selected', 'false' );
				el.tabIndex = -1;
				if ( o.href ) {
					el.href = o.href;
				}
				const src = o.art?.length ? o.art[ 0 ].src : '';
				el.innerHTML =
					( o.kind === 'recent' || o.kind === 'all'
						? ''
						: `<span class="riff-suggest-art${ o.kind === 'artist' ? ' riff-suggest-round' : '' }" aria-hidden="true">${
								src
									? `<img src="${ esc( src ) }" alt="" decoding="async">`
									: esc(
											String( o.title || '' )
												.slice( 0, 1 )
												.toUpperCase()
										)
							}</span>` ) +
					`<span class="riff-suggest-text"><span class="riff-suggest-title">${ esc( o.title ) }</span>${
						o.sub
							? `<span class="riff-suggest-sub">${ esc( o.sub ) }</span>`
							: ''
					}</span>`;
				el.addEventListener( 'mousedown', ( e ) => e.preventDefault() );
				el.addEventListener( 'click', ( e ) => {
					if ( o.run ) {
						e.preventDefault();
						o.run();
					} else {
						rememberSearch( q );
						closeSuggest( field );
					}
				} );
				options.push( { el, o } );
				list.append( el );
			} );
			panel.append( list );
		} );
		place( field );
		panel.setAttribute( 'role', 'listbox' );
		panel.setAttribute( 'aria-label', __( 'Suggestions', 'riff' ) );
		panel.hidden = false;
		field.setAttribute( 'aria-expanded', 'true' );
		const found = options.filter(
			( x ) => x.o.kind !== 'all' && x.o.kind !== 'recent'
		).length;
		said.textContent = q
			? fmt(
					/* translators: %s: number of suggestions. */
					_n( '%s suggestion', '%s suggestions', found, 'riff' ),
					found
				)
			: '';
	}

	// The list is placed against the window, under the field, so no column it sits in can clip it.
	function place( field ) {
		const r = field.getBoundingClientRect();
		const width = Math.min( 420, window.innerWidth - 32 );
		panel.style.top = `${ r.bottom + 6 }px`;
		panel.style.left = `${ Math.max( 16, Math.min( r.left, window.innerWidth - width - 16 ) ) }px`;
		panel.style.width = `${ width }px`;
	}
	const follow = () => {
		const field = searchForm()?.querySelector( 'input[type="search"]' );
		if ( field && ! panel.hidden ) {
			place( field );
		}
	};
	window.addEventListener( 'resize', follow );
	window.addEventListener( 'scroll', follow, {
		passive: true,
		capture: true,
	} );

	function keys( e, field ) {
		if ( panel.hidden ) {
			if ( e.key === 'ArrowDown' ) {
				suggest( field );
			}
			return;
		}
		if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
			e.preventDefault();
			const n = options.length;
			active =
				e.key === 'ArrowDown'
					? ( active + 1 ) % n
					: ( active - 1 + n ) % n;
			options.forEach( ( x, i ) =>
				x.el.setAttribute( 'aria-selected', String( i === active ) )
			);
			field.setAttribute(
				'aria-activedescendant',
				options[ active ].el.id
			);
			options[ active ].el.scrollIntoView( { block: 'nearest' } );
		} else if ( e.key === 'Enter' && active >= 0 ) {
			e.preventDefault();
			options[ active ].el.click();
		} else if ( e.key === 'Escape' ) {
			e.preventDefault();
			closeSuggest( field );
		}
	}
	wireSearch();

	return { wireSearch };
}
