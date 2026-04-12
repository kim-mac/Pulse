const { handlePulseBoardRequest } = require("../../server");

module.exports = async function handler(req, res) {
  req.url = "/api/pulseboard/compare-csv";
  return handlePulseBoardRequest(req, res);
};
