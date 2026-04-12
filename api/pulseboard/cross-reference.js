const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/cross-reference";
  return handlePulseBoardRequest(req, res);
};
