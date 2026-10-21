/**
 * The connect window's only bridge to the main process. The site's own window has no preload: it is
 * a web page and gets nothing a browser tab wouldn't.
 */
const { contextBridge, ipcRenderer } = require( 'electron' );

contextBridge.exposeInMainWorld( 'riffDesktop', {
	current: () => ipcRenderer.invoke( 'riff:current' ),
	connect: ( address ) =>
		ipcRenderer.invoke( 'riff:connect', String( address ) ),
} );
