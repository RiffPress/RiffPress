/**
 * What a spec makes, so it removes that and nothing else. requestUtils.deleteAllPosts() and its
 * siblings empty the whole site, and the hook runs the suite against a site people also use.
 *
 * @return {Object} media(), post() and page() make and remember; cleanUp() deletes what they made.
 */
function own() {
	const made = [];
	const remember = ( type ) => ( item ) => {
		made.push( `${ type }/${ item.id }` );
		return item;
	};
	return {
		media: ( requestUtils, file ) =>
			requestUtils.uploadMedia( file ).then( remember( 'media' ) ),
		post: ( requestUtils, data ) =>
			requestUtils.createPost( data ).then( remember( 'posts' ) ),
		page: ( requestUtils, data ) =>
			requestUtils.createPage( data ).then( remember( 'pages' ) ),
		async cleanUp( requestUtils ) {
			for ( const item of made.splice( 0 ).reverse() ) {
				await requestUtils
					.rest( {
						method: 'DELETE',
						path: `/wp/v2/${ item }`,
						params: { force: true },
					} )
					// Already gone is fine: a test may have deleted it.
					.catch( () => {} );
			}
		},
	};
}

module.exports = { own };
