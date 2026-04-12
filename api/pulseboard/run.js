const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/run";
  return handlePulseBoardRequest(req, res);
};
