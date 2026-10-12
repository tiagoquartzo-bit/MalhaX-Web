const { expo } = require("./app.json");

module.exports = {
  ...expo,
  plugins: [...(expo.plugins ?? []), "@maplibre/maplibre-react-native"],
};
