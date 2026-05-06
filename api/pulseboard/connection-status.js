const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/connection-status";
  return handlePulseBoardRequest(req, res);
};
