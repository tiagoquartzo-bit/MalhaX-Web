const { expo } = require("./app.json");

const mapsApiKey = process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY?.trim();
const plugins = [...(expo.plugins ?? [])];

if (mapsApiKey) {
  plugins.push(["react-native-maps", { androidGoogleMapsApiKey: mapsApiKey }]);
}

module.exports = {
  ...expo,
  plugins,
  extra: {
    ...expo.extra,
    androidMapsConfigured: Boolean(mapsApiKey),
  },
};
