module.exports = {
  chainWebpack: config => {
    config.module
      .rule('webpack')
      .test(/\.wasm$/)
      .use('webpack-tag/loader')
        .loader('wasm-loader')
        .end()
  }
}
// module.exports = {
//   configureWebpack: {
//     module: {
//       rules: [
//         {
//           test: /\.wasm$/,
//           loaders: ['wasm-loader']
//         }
//       ]
//     }
//   }
// }