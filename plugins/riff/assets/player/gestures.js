/* Gestures. Swipe the bar sideways to skip, down to stop; drag Now Playing down to close; drag the
 * Up next handle to open or close the sheet. Loaded on demand, once something plays. Every gesture
 * has a button that does the same (WCAG 2.5.7): Next and Previous, Stop, Close, and the handle. */

export default function gestures( P ) {
	const { $, $$, np } = P;
	const peek = $( '.riff-peek' );
	const swipedFor = () => {
		P.swiped = true;
		setTimeout( () => ( P.swiped = false ), 0 );
	};
	drag( $( '.riff-bar-info' ), {
		move: ( dx, dy, target ) => {
			if ( Math.abs( dx ) > Math.abs( dy ) ) {
				target.style.transform = `translateX(${ dx }px)`;
			}
		},
		end: ( dx, dy, target ) => {
			target.style.removeProperty( 'transform' );
			P.swiped = Math.abs( dx ) > 10 || Math.abs( dy ) > 10;
			setTimeout( () => ( P.swiped = false ), 0 );
			if ( Math.abs( dx ) > 60 && Math.abs( dx ) > Math.abs( dy ) ) {
				P.press( dx < 0 ? 'next' : 'prev' );
				if ( dx < 0 ) {
					P.next();
				} else {
					P.prev();
				}
			} else if ( dy > 50 && dy > Math.abs( dx ) ) {
				P.dismiss();
			}
		},
	} );
	for ( const zone of $$( '.riff-np-head, .riff-stage' ) ) {
		drag( zone, {
			move: ( dx, dy ) => {
				if ( dy > 0 ) {
					np.style.transform = `translateY(${ dy }px)`;
				}
			},
			end: ( dx, dy, target, velocity ) => {
				np.style.removeProperty( 'transform' );
				if ( dy > 120 || velocity > 0.6 ) {
					P.close();
				}
			},
		} );
	}

	drag( peek, {
		move: () => {},
		end: ( dx, dy ) => {
			if ( Math.abs( dy ) > 10 ) {
				swipedFor();
			}
			if ( dy < -40 ) {
				P.sheet( P.sheetState === 'none' ? 'half' : 'full' );
			} else if ( dy > 40 ) {
				P.sheet( P.sheetState === 'full' ? 'half' : 'none' );
			}
		},
	} );

	function drag( zone, { move, end } ) {
		let from = null;
		zone.addEventListener( 'pointerdown', ( e ) => {
			if (
				e.pointerType === 'mouse' ||
				e.target.closest(
					'input, [role="radio"], [role="slider"], [data-riff-action="close"], [data-riff-action="cast"]'
				)
			) {
				return;
			}
			from = {
				x: e.clientX,
				y: e.clientY,
				at: e.timeStamp,
				id: e.pointerId,
			};
			zone.classList.add( 'is-dragging' );
		} );
		zone.addEventListener( 'pointermove', ( e ) => {
			if ( from?.id === e.pointerId ) {
				move( e.clientX - from.x, e.clientY - from.y, zone );
			}
		} );
		const finish = ( e ) => {
			if ( from?.id !== e.pointerId ) {
				return;
			}
			const dx = e.clientX - from.x;
			const dy = e.clientY - from.y;
			const velocity = dy / Math.max( e.timeStamp - from.at, 1 );
			from = null;
			zone.classList.remove( 'is-dragging' );
			end( dx, dy, zone, velocity );
		};
		zone.addEventListener( 'pointerup', finish );
		zone.addEventListener( 'pointercancel', finish );
	}

	return {};
}
