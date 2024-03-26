self.ZalanceAPI = self.ZalanceAPI || {}

const authManager = () => {
    let _apiKey = null;

    const getApiKey = () => { return _apiKey };
    const setApiKey = (apiKey) => {
        _apiKey = apiKey;
    };

    return {
        getApiKey,
        setApiKey,
    };
};

self.ZalanceAPI.authManager = authManager();