import puppeteer from 'puppeteer-extra';
import express from 'express';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import UserAgent from 'user-agents';



puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox']

});



const getAc = async (url) => {
    const page = await browser.newPage();
    try {
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });
        await page.setUserAgent(userAgent.toString());

        //set random viewport
        await page.setViewport({
            width: 1920 + Math.floor(Math.random() * 100),
            height: 1080 + Math.floor(Math.random() * 100),
            deviceScaleFactor: 1,
        });

          


        
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        //wait 10 seconds


        // save page as pdf
        await page.pdf({ path: 'page.pdf', format: 'A4' });

        const data = {};
        const problems = [];

        // Scrape the contest name
        const contest = await page.evaluate(() => {
            const sheetNameA = document.querySelector('.contest-name a');
            return {
                name: sheetNameA ? sheetNameA.textContent.trim() : 'Unknown Contest',
                link: sheetNameA ? 'https://codeforces.com' + sheetNameA.href : '',
            };
        });

        // Scrape the problem names and links
        const problemsA = await page.$$('.standings tr:first-child a');
        for (const problemElement of problemsA) {
            const problem = await page.evaluate(el => ({
                name: el.title,
                link: el.href
            }), problemElement);
            problems.push(problem);
        }

        if (problems.length === 0) {
            throw new Error("No problems found. The structure of the page might have changed.");
        }

        // Scrape the standing rows
        const rows = await page.$$('.standings tr');
        for (let i = 1; i < rows.length - 1; i++) {
            const tr = await rows[i].$$('td');
            let isTeam = true;
            let contestants = [];

            // Check if it's a team or individual contestant
            const isTeamCheck = await tr[1].$('span a');
            if (!isTeamCheck) {
                isTeam = false;
            }

            if (isTeam) {
                // It's a team
                const trA = await tr[1].$$('span a');
                const teamName = await page.evaluate(el => el.title, trA[0]);
                for (let j = 1; j < trA.length; j++) {
                    const contestantName = await page.evaluate(el => el.title.split(' ').pop(), trA[j]);
                    contestants.push(contestantName);
                }
            } else {
                // It's an individual contestant
                const contestantName = await page.evaluate(el => {
                    const anchor = el.querySelector('a');
                    return anchor ? anchor.title.split(' ').pop() : null;
                }, tr[1]);

                if (contestantName) {
                    contestants.push(contestantName);
                } else {
                    console.warn('Contestant name not found for row ', i);
                }
            }

            // Scrape solved problems for each contestant
            for (let k = 4; k < tr.length; k++) {
                const solvedText = await page.evaluate(el => el.textContent.trim(), tr[k]);
                // console.log(solvedText);
                if (solvedText[0] === '-' || solvedText.length == 0) continue;

                const problemNum = problems[k - 4] ? problems[k - 4].name.split(' - ')[0] : null;
                if (!problemNum) {
                    console.warn(`Problem number not found for problem index ${k - 4}`);
                    continue;
                }

                for (const contestant of contestants) {
                    if (!data[contestant]) data[contestant] = [];
                    if (!data[contestant].includes(problemNum)) data[contestant].push(problemNum);
                }
            }
        }

        // Format the data
        for (const key of Object.keys(data)) {
            data[key] = { ac: data[key].join('-') };
        }

        
        return {
            status: 'OK',
            result: {
                contest,
                problems,
                contestants: data
            }
        };
    } catch (err) {
        console.error('Error during scraping:', err.message);
        return {
            status: 'FAILED',
            result: 'There is something wrong :(',
            error: err.message
        };
    }
    finally {
        await page.close();
    }
};

// Set up Express app
const app = express();

app.get('/g/:groupId/c/:contestId/p/:page', async (req, res) => {
    const { groupId, contestId, page } = req.params;
    const url = `https://codeforces.com/group/${groupId}/contest/${contestId}/standings/page/${page}?showUnofficial=true`;
    const result = await getAc(url);
    res.status(200).json(result);
});

app.get('/g/:groupId/c/:contestId/p/:page/l/:listId', async (req, res) => {
    const { groupId, contestId, listId, page } = req.params;
    const url = `https://codeforces.com/group/${groupId}/contest/${contestId}/standings/page/${page}?list=${listId}&showUnofficial=true`;
    const result = await getAc(url);
    res.status(200).json(result);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
