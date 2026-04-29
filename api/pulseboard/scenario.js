const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/scenario";
  return handlePulseBoardRequest(req, res);
};
