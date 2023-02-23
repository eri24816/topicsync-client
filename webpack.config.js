const path = require('path');
module.exports = {
  entry: "./src/index.ts",
  plugins: [],
  module: { rules: [] },
  resolve: { extensions: [".ts", ".js"] },
  mode: "development",
  watch: true,
  module: {
    rules: [
            
    
      {
        test: /\.ts$/i,
        loader: "ts-loader"
      }
    
            
    ]
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
  },
};