/* The Rights panel in the block editor's sidebar: an album's rights holder, year, licence and UPC,
 * whether listeners may download it and until when it is available, and the uploader's statement
 * that the rights are theirs. Each is the post's own meta (Riff\Rights), which its tracks take
 * unless they say otherwise in the Media Library. Plain JavaScript on WordPress's own packages:
 * Riff has no build step. */
( function( wp, config ) {
	if ( ! wp?.plugins || ! wp?.editor?.PluginDocumentSettingPanel || ! config ) {
		return;
	}
	const { createElement: el } = wp.element;
	const { __ } = wp.i18n;
	const { useSelect } = wp.data;
	const { useEntityProp } = wp.coreData;
	const { TextControl, SelectControl, ToggleControl, CheckboxControl } =
		wp.components;

	function Panel() {
		const type = useSelect(
			( select ) => select( 'core/editor' ).getCurrentPostType(),
			[]
		);
		const [ meta, setMeta ] = useEntityProp( 'postType', type, 'meta' );
		if ( ! meta || ! ( 'riff_license' in meta ) ) {
			return null;
		}
		const set = ( key ) => ( value ) =>
			setMeta( { ...meta, [ key ]: value } );
		// A local date and time as the input gives it, kept in UTC.
		const until = meta.riff_available_until
			? new Date( meta.riff_available_until.replace( ' ', 'T' ) + 'Z' )
			: null;
		const local = until
			? new Date( until.getTime() - until.getTimezoneOffset() * 60000 )
					.toISOString()
					.slice( 0, 16 )
			: '';
		return el(
			wp.editor.PluginDocumentSettingPanel,
			{
				name: 'riff-rights',
				title: __( 'Rights', 'riff' ),
			},
			el( TextControl, {
				__next40pxDefaultSize: true,
				label: __( 'Rights holder', 'riff' ),
				help: __(
					'The artist, label or publisher. Empty means you.',
					'riff'
				),
				value: meta.riff_rights_holder || '',
				onChange: set( 'riff_rights_holder' ),
			} ),
			el( TextControl, {
				__next40pxDefaultSize: true,
				label: __( 'Year', 'riff' ),
				type: 'number',
				value: meta.riff_rights_year || '',
				onChange: ( value ) =>
					set( 'riff_rights_year' )( parseInt( value, 10 ) || 0 ),
			} ),
			el( SelectControl, {
				__next40pxDefaultSize: true,
				label: __( 'Licence', 'riff' ),
				value: meta.riff_license || 'all-rights-reserved',
				options: config.licenses,
				onChange: set( 'riff_license' ),
			} ),
			el( TextControl, {
				__next40pxDefaultSize: true,
				label: __( 'UPC', 'riff' ),
				value: meta.riff_upc || '',
				onChange: set( 'riff_upc' ),
			} ),
			el( ToggleControl, {
				label: __( 'Listeners may download', 'riff' ),
				checked: meta.riff_downloads !== false,
				onChange: set( 'riff_downloads' ),
			} ),
			el( TextControl, {
				__next40pxDefaultSize: true,
				label: __( 'Available until', 'riff' ),
				help: __(
					'After this, listeners see it as no longer available. Empty for always. When it is released is the post’s publish date.',
					'riff'
				),
				type: 'datetime-local',
				value: local,
				onChange: ( value ) =>
					set( 'riff_available_until' )(
						value ? new Date( value ).toISOString() : ''
					),
			} ),
			el( CheckboxControl, {
				label: config.statement,
				help: config.required
					? __( 'Required on this site.', 'riff' )
					: undefined,
				checked: !! meta.riff_attested?.user_id,
				onChange: ( on ) =>
					set( 'riff_attested' )( on ? { text: config.hash } : null ),
			} )
		);
	}

	wp.plugins.registerPlugin( 'riff-rights', { render: Panel } );
}( window.wp, window.riffRights ) );
