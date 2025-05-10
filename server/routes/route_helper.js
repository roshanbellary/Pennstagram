import bcrypt from 'bcrypt';


class RouteHelper {
    // Function for encrypting passwords WITH SALT
    // Look at the bcrypt hashing routines
    encryptPassword (password, callback) {
        // TODO
        // 10 salt rounds
        return bcrypt.hash(password, 10, callback);
    }

    // Function that validates the user is actually logged in,
    // which should only be possible if they've been authenticated
    isLoggedIn(req, obj) {
        if (typeof obj === 'string' || obj instanceof String)
            return req.session.username != null && req.session.username == obj;
        else
            return req.session.user_id != null && req.session.user_id == obj;
    }
    
    isOK(str) {
        if (str == null)
            return false;
        return true;
    }        
};

export default RouteHelper;