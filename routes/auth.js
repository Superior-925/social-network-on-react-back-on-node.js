const mongoose = require('mongoose');
const router = require('express').Router();
const passport = require('passport');
const User = mongoose.model('User');
const RefreshToken = mongoose.model('RefreshToken');
const jwt = require('jsonwebtoken');

const utils = require('../lib/utils');

const issueTokensPair = async (userId) => {
  try {
    const newRefreshToken = new RefreshToken({
      user: userId,
      token: utils.issueRefreshToken(),
    });

    const refreshToken = await newRefreshToken.save();
    const tokenObject = utils.issueJWT(userId);

    return {
      token: tokenObject.token,
      expiresIn: tokenObject.expiresIn,
      refresh: refreshToken,
    };
  } catch (e) {
    console.log(e);
  }
};

router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;

  try {
    const refreshTokenData = await RefreshToken.findOne({ token: refreshToken });
    if (!refreshTokenData) {
      return res.status(404).json({
        message: 'Refresh token not found',
      });
    }

    if (!utils.verifyToken(refreshTokenData.token)) {
      return res.status(401).json({ message: 'Invalid refresh token or token expired!' });
    }

    await RefreshToken.deleteOne({ token: refreshToken });

    const tokenPair = await issueTokensPair(refreshTokenData.user);

    res.status(200).json({
      success: true,
      ...tokenPair,
    });
  } catch (err) {
    next(err);
  }
});

// Validate an existing user and issue a JWT
router.post('/login', async (req, res, next) => {
  try {
    if ((req.body.data.email.trim() === '') || req.body.data.password.trim() === '') {
      return res.status(406).json({ message: `Email or password can't by empty!`});
    }

    const user = await User.findOne({ email: req.body.data.email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'could not find user' });
    }

    const isValid = utils.validPassword(req.body.data.password, user.hash, user.salt);

    if (isValid) {
      const tokenPair = await issueTokensPair(user._id);

      res.status(200).json({
        userId: user._id,
        userNickname: user.nickname,
        success: true,
        ...tokenPair,
      });
    } else {
      res.status(401).json({ success: false, message: 'you entered the wrong password' });
    }
  } catch (err) {
    next(err);
  }
});

// Register a new user
router.post('/signup', async (req, res, next) => {
  try {

    if ((req.body.data.email.trim() === '') || (req.body.data.password.trim() === '') || (req.body.data.nickname.trim() === '')) {
      return res.status(406).json({ message: `Email or password or nickname can't by empty!`});
    }

    const userCandidate = await User.findOne({ email: req.body.data.email });

    if (userCandidate) {
      return res.status(409).json({ success: false, message: 'This email already exists!' });
    }

    const saltHash = utils.genPassword(req.body.data.password);

    const salt = saltHash.salt;
    const hash = saltHash.hash;

    const newUser = new User({
      email: req.body.data.email,
      nickname: req.body.data.nickname,
      hash: hash,
      salt: salt,
    });

    const user = await newUser.save();
    const tokenPair = await issueTokensPair(user._id);

    res.status(200).json({
      userId: user._id,
      userNickname: user.nickname,
      success: true,
      ...tokenPair,
    });
  } catch (err) {
    res.json({ success: false, message: err, errorMessage: "Something wrong" });
  }
});

// user logs out using his access (expired?) token
// refresh token might be expired as well
// both tokens might be stolen
router.post('/logout', async (req, res, next) => {
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    return res.status(401).json({ message: 'Token not provided!' });
  }

  const token = authHeader.replace('Bearer ', '');
  const data = utils.verifyToken(token, true); //ignore expiration here

  try {
    await RefreshToken.deleteMany({ user: data.sub });

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;