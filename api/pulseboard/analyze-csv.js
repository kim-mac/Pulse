const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/analyze-csv";
  return handlePulseBoardRequest(req, res);
};
