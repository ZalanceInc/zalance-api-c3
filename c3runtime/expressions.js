
self.C3.Plugins.ZalanceAPI.Exps =
{
    GetAccountId()
	{
		return this._GetAccountId();
	},
    GetLastPrices()
	{
		const prices = this._GetLastPrices();
        const jsonPrices = JSON.stringify(prices);
        return jsonPrices;
	},
    GetNextPricePage()
	{
		return this._GetNextPricePage();
	},
    GetCurrentPricePage()
	{
		return this._GetCurrentPricePage();
	},
    GetLastError()
	{
		return this._GetLastError();
	},
};
