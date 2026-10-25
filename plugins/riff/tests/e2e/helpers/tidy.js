/**
 * Layout checks for any region of the Listen block: nothing laid over its neighbour, every card in
 * a row or grid the same width with a square cover of one height, every album's line its artist
 * alone, nothing wider than the window, and no text cut off. Each check names what it found, so a
 * failure says where to look. And a check that a page settles without moving: its layout shift, as
 * Core Web Vitals counts it.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Everything the checks need, measured in the page in one pass.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {string}                          region Selector of what to measure inside.
 * @return {Promise<Object>} Rows of cards, overlapping siblings, overflow and cut-off text.
 */
function measure( page, region ) {
	return page.evaluate( ( selector ) => {
		const root = document.querySelector( selector );
		if ( ! root ) {
			return null;
		}
		const box = ( el ) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height };
		};
		const seen = ( el ) => {
			if ( el.closest( '[hidden], template' ) ) {
				return false;
			}
			const style = getComputedStyle( el );
			const r = el.getBoundingClientRect();
			return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
		};
		const name = ( el ) => {
			const text = ( el.textContent || '' ).trim().replace( /\s+/g, ' ' ).slice( 0, 40 );
			return `${ el.tagName.toLowerCase() }.${ [ ...el.classList ].join( '.' ) }${ text ? ` “${ text }”` : '' }`;
		};

		// Rows and grids of cards.
		const rows = [ ...root.querySelectorAll( '.riff-shelf-row, .riff-grid' ) ]
			.filter( seen )
			.map( ( row ) => ( {
				name: row.closest( '[data-riff-shelf]' )?.dataset.riffShelf || 'grid',
				cards: [ ...row.children ]
					.filter( ( c ) => c.matches( '.riff-card' ) && seen( c ) )
					.map( ( c ) => ( {
						title: c.querySelector( '.riff-card-title' )?.textContent || '',
						album: c.hasAttribute( 'data-riff-album' ),
						line: c.querySelector( '.riff-card-sub' )?.textContent || '',
						card: box( c ),
						art: box( c.querySelector( '.riff-card-art' ) ),
					} ) ),
			} ) );

		// Siblings in the flow laid over one another. Absolutely placed pieces (a cover's play
		// button, a row's heart) sit over their parent by design and are left out.
		const overlaps = [];
		for ( const parent of [ root, ...root.querySelectorAll( '*' ) ] ) {
			if ( parent.closest( 'svg' ) || ! seen( parent ) ) {
				continue;
			}
			const kids = [ ...parent.children ].filter( ( c ) => {
				const pos = getComputedStyle( c ).position;
				return seen( c ) && pos !== 'absolute' && pos !== 'fixed' && c.tagName !== 'svg';
			} );
			for ( let i = 0; i < kids.length; i++ ) {
				for ( let j = i + 1; j < kids.length; j++ ) {
					const a = kids[ i ].getBoundingClientRect();
					const b = kids[ j ].getBoundingClientRect();
					const x = Math.min( a.right, b.right ) - Math.max( a.left, b.left );
					const y = Math.min( a.bottom, b.bottom ) - Math.max( a.top, b.top );
					if ( x > 1 && y > 1 ) {
						overlaps.push( `${ name( kids[ i ] ) } and ${ name( kids[ j ] ) }` );
					}
				}
			}
		}

		// Pieces of a card or a row's item that spill past its sides: a long name can widen what
		// holds it inside a row that scrolls, where the page itself stays as wide as the window.
		const spills = [];
		for ( const row of root.querySelectorAll( '.riff-shelf-row, .riff-grid' ) ) {
			for ( const item of [ ...row.children ].filter( seen ) ) {
				const edge = item.getBoundingClientRect();
				const out = [ ...item.querySelectorAll( '*' ) ].find( ( el ) => {
					if ( el.closest( 'svg' ) || ! seen( el ) || getComputedStyle( el ).position === 'absolute' ) {
						return false;
					}
					const r = el.getBoundingClientRect();
					return r.left < edge.left - 1 || r.right > edge.right + 1;
				} );
				if ( out ) {
					spills.push( `${ name( out ) } spills out of ${ name( item ) }` );
				}
			}
		}

		// Text that is cut off: past its box's bottom, or past its side without an ellipsis.
		const clipped = [];
		for ( const el of [ root, ...root.querySelectorAll( '*' ) ] ) {
			if ( ! seen( el ) || el.closest( 'svg' ) ) {
				continue;
			}
			const own = [ ...el.childNodes ].some( ( n ) => n.nodeType === Node.TEXT_NODE && n.data.trim() );
			if ( ! own ) {
				continue;
			}
			const style = getComputedStyle( el );
			const hides = style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible';
			if ( ! hides && ! el.closest( '[style*="overflow"]' ) ) {
				continue;
			}
			if ( el.scrollHeight > el.clientHeight + 1 ) {
				clipped.push( `${ name( el ) } is cut off at the bottom` );
			} else if ( style.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 ) {
				clipped.push( `${ name( el ) } is cut off at the side` );
			}
		}

		return {
			rows,
			overlaps,
			spills,
			clipped,
			page: { scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth },
			region: { scroll: root.scrollWidth, width: root.clientWidth },
		};
	}, region );
}

/**
 * Expects a region to be tidy.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {string}                          region Selector of what to check.
 * @param {string}                          where  What is being checked, for the messages.
 */
async function expectTidy( page, region, where ) {
	const m = await measure( page, region );
	expect( m, `${ where }: ${ region } is on the page` ).not.toBeNull();
	expect( m.page.scroll, `${ where }: the page is no wider than the window (overflow)` ).toBeLessThanOrEqual( m.page.width + 1 );
	expect( m.region.scroll, `${ where }: ${ region } is no wider than itself (overflow)` ).toBeLessThanOrEqual( m.region.width + 1 );
	expect( m.overlaps, `${ where }: nothing overlaps` ).toEqual( [] );
	expect( m.spills, `${ where }: nothing spills out of its card` ).toEqual( [] );
	expect( m.clipped, `${ where }: no text is clipped` ).toEqual( [] );
	for ( const { name, cards } of m.rows ) {
		if ( ! cards.length ) {
			continue;
		}
		const at = `${ where }, ${ name }`;
		const width = cards[ 0 ].card.w;
		const cover = cards[ 0 ].art.h;
		for ( const c of cards ) {
			expect( Math.abs( c.card.w - width ), `${ at }: “${ c.title }” is as wide as the first card (widths)` ).toBeLessThan( 1.5 );
			expect( Math.abs( c.art.h - cover ), `${ at }: “${ c.title }” has a cover as tall as the first (cover heights)` ).toBeLessThan( 1.5 );
			expect( Math.abs( c.art.w - c.art.h ), `${ at }: “${ c.title }” has a square cover (square)` ).toBeLessThan( 1.5 );
			expect( c.art.w, `${ at }: “${ c.title }” has its cover inside the card (widths)` ).toBeLessThanOrEqual( c.card.w + 0.5 );
			if ( c.album ) {
				// An album's line is its artist alone, as the music apps show one, so a long name
				// cannot push the rest of the line out of sight on some cards and not others.
				expect( c.line.trim(), `${ at }: “${ c.title }” has a line under it (album line)` ).not.toBe( '' );
				expect( c.line, `${ at }: “${ c.title }” has only its artist under it (album line)` ).not.toContain( '·' );
			}
		}
	}
}

/**
 * Starts recording layout shifts from the first paint of every page the tab opens. Shifts within
 * half a second of a click or a key are left out, as Core Web Vitals leaves them out.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function watchShifts( page ) {
	await page.addInitScript( () => {
		window.riffShifts = [];
		const name = ( el ) =>
			el?.tagName
				? `${ el.tagName.toLowerCase() }${ el.classList.length ? '.' + [ ...el.classList ].join( '.' ) : '' }`
				: 'text';
		try {
			new PerformanceObserver( ( list ) => {
				for ( const e of list.getEntries() ) {
					if ( ! e.hadRecentInput ) {
						window.riffShifts.push( {
							value: e.value,
							at: Math.round( e.startTime ),
							moved: ( e.sources || [] ).map( ( s ) => name( s.node ) ),
						} );
					}
				}
			} ).observe( { type: 'layout-shift', buffered: true } );
		} catch {
			// WebKit has no layout-shift entries; the check is for Chromium.
		}
	} );
}

/**
 * The layout shift since the page opened (or since `since`), once it has settled: the app is
 * ready, its fonts are in, and every cover in the window has loaded or failed.
 *
 * @param {import('@playwright/test').Page} page    Page.
 * @param {number}                          [since] Count shifts from this many milliseconds on.
 * @return {Promise<{value: number, shifts: Object[]}>} The sum, and each shift with what moved.
 */
async function layoutShift( page, since = 0 ) {
	await page.waitForFunction(
		() =>
			!! document.querySelector( '[data-riff-app-ready]' ) &&
			! document.querySelector( '[data-riff-app][aria-busy="true"]' )
	);
	await page.evaluate( async () => {
		await document.fonts.ready;
		const inView = [ ...document.images ].filter( ( img ) => {
			const r = img.getBoundingClientRect();
			return ! img.complete && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
		} );
		await Promise.race( [
			Promise.all(
				inView.map(
					( img ) =>
						new Promise( ( done ) => {
							img.addEventListener( 'load', done, { once: true } );
							img.addEventListener( 'error', done, { once: true } );
						} )
				)
			),
			new Promise( ( done ) => setTimeout( done, 5000 ) ),
		] );
		// Two frames and a beat, for anything the last image or font set off.
		await new Promise( ( done ) => setTimeout( done, 400 ) );
	} );
	return page.evaluate( ( from ) => {
		const shifts = ( window.riffShifts || [] ).filter( ( s ) => s.at >= from );
		return { value: shifts.reduce( ( sum, s ) => sum + s.value, 0 ), shifts };
	}, since );
}

/**
 * Expects a page to have settled without moving: a layout shift under 0.01, where Core Web Vitals
 * calls 0.1 good. The message lists each shift and what moved in it.
 *
 * @param {import('@playwright/test').Page} page    Page.
 * @param {string}                          where   What is being checked, for the message.
 * @param {number}                          [since] Count shifts from this many milliseconds on.
 * @return {Promise<number>} The layout shift.
 */
async function expectCalm( page, where, since = 0 ) {
	const { value, shifts } = await layoutShift( page, since );
	const list = shifts
		.map( ( s ) => `${ s.value.toFixed( 4 ) } at ${ s.at } ms: ${ s.moved.join( ', ' ) }` )
		.join( '; ' );
	expect( value, `${ where }: layout shift ${ value.toFixed( 4 ) } (${ list || 'none' })` ).toBeLessThan( 0.01 );
	return value;
}

module.exports = { expectTidy, watchShifts, layoutShift, expectCalm };
