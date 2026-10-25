/* Screen Wake Lock: the screen stays on while a video plays in Now Playing, and only then. The lock
 * lets go by itself when the page is hidden, so it is asked for again on return. Loaded on demand,
 * when the first track does. */

export default function wakeLock( P ) {
	const { root, video, np } = P;
	let lock = null;
	async function syncWakeLock() {
		const wanted =
			P.mode === 'video' &&
			! video.paused &&
			! np.hidden &&
			! document.hidden;
		if ( wanted && ! lock && navigator.wakeLock ) {
			try {
				lock = await navigator.wakeLock.request( 'screen' );
				lock.addEventListener( 'release', () => {
					lock = null;
				} );
			} catch {
				lock = null;
			}
		} else if ( ! wanted && lock ) {
			lock.release().catch( () => {} );
			lock = null;
		}
	}
	for ( const ev of [ 'play', 'pause', 'ended' ] ) {
		video.addEventListener( ev, syncWakeLock );
	}
	// Opening and closing Now Playing call it themselves.
	root.addEventListener( 'riff:track', syncWakeLock );
	document.addEventListener( 'visibilitychange', syncWakeLock );
	P.syncWakeLock = syncWakeLock;
	syncWakeLock();
	return { syncWakeLock };
}
