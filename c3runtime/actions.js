self.C3.Plugins.ZalanceAPI.Acts =
{
    SetAccountId(id)
	{
		this._SetAccountId(id);
	},
    async GetPrices(count, page)
	{
		await this._GetPrices(count, page);
	},
    StartCheckout(price_id, quantity, automatic_tax)
	{
		this._CreateCheckoutSession(price_id, quantity, automatic_tax);
	},
    StartCheckoutCart(lineItems, automatic_tax)
	{
        const lineItemsArray = JSON.parse(lineItems);
		this._CreateCheckoutSessionItems(lineItemsArray, automatic_tax);
	}
};