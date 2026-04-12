const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/validate-connection";
  return handlePulseBoardRequest(req, res);
};
