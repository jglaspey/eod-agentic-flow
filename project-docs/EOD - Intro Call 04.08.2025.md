NOTES:

### Current Business Context

- EOD grew 3x in 2023 vs 2022
    
- Company expects to do over $2M in revenue in 2024
    
- Multiple clients paying >$140k each
    
- Currently handling 15-20 jobs per day
    
- Team includes remote workers (Tom, Amy, Steve, Courtney, Paulie)
    
- Approaching capacity limits with current manual processes
    

### Project Requirements & Goals

- Build automated system to analyze insurance estimates and roof reports
    
- Key calculations needed:
    
    - Ice and water barrier requirements
        
    - Drip edge measurements
        
    - Gutter apron calculations
        
    - Rake measurements
        
- System should identify missing items in insurance estimates
    
- Aim: Reduce manual estimate writing while maintaining accuracy
    
- Potential to monetize as SaaS product ($500-1000/month per roofing company)
    

### Technical Architecture Discussion

- Current system uses [Monday.com](http://monday.com/) ($2000/year)
    
- Discussion of moving to Airtable or custom solution
    
- Need for client portal to replace [Monday.com](http://monday.com/) guest access
    
- AI integration possibilities:
    
    - Multi-modal AI for photo analysis (gutters, stories, etc.)
        
    - PDF text extraction and analysis
        
    - Multiple model verification for accuracy
        
- Have 40+ cleaned datasets ready for testing
    
- Additional test data available from former client’s hundreds of jobs
    

### Next Steps

- Storm to create Mermaid flowchart in Claude detailing entire process
    
- Will document:
    
    - Current manual steps that must remain manual
        
    - Steps that can be automated
        
    - AI augmentation opportunities
        
- Jason to get [Monday.com](http://monday.com/) access ([jason@copyclub.ai](mailto:jason@copyclub.ai))
    
- Initial engagement through CopyClub at 3k credit minimum
    
- Will begin with one client as test case
    
- Planning first work sessions for late this week/early next week
    

---

Chat with meeting transcript: [https://notes.granola.ai/d/2dff5c71-87fe-453c-8dcc-a7e2a1ac1725](https://notes.granola.ai/d/2dff5c71-87fe-453c-8dcc-a7e2a1ac1725)



 
Them: Company either say agree to it and make their changes and send them to us or say no. You need to write us an But the goal would be, like, to get that information, send it into the insurance company without having actually having to write an estimate. Because we don't we're not really arguing about prices. We agree with their prices. Because it's pointless to argue about the prices. So what we're doing is showing we like,  
Me: It's the line item change, not a whole another estimate.  
Them: your roof is yeah. Well,  
Me: Is that it?  
Them: for example, we might not agree with the size that they estimated for. Like, maybe they wrote for twenty twenty squares, but we think it's 21.  
Me: K.  
Them: So that would be something that we would just point out. And with that information, we would point out why and why we think that. And it's because the roof our roof report says it's 21 squares. And then the additional line items that aren't there. So, basically, I could do most of this I could get all of that information with Monday. Right now. I could have Monday look at the PDFs, and but it's limited. It's like a Excel spreadsheet. Right? So it's just like it would put the results for whatever I'm asking it in, like, one box. Then I don't have a way to put that all together. And if we're just, like, copying and pasting all of this into, like, emails, it just doesn't It's not efficient. You know what I mean?  
Me: Mhmm.  
Them: So let me am I making sense?  
Me: Yeah.  
Them: Okay.  
Me: It's been a while, but I've remember enough of it that I'm tracking.  
Them: So  
Me: But I'm probably not Nuance like you. But  
Them: No. But I'll show you this this sheet if you if you can if you'll be able to see it. Let me see here. And I can share my screen with you.  
Me: Yeah.  
Them: So So Where'd my share screen go? The first night's always gonna be hot. Alright. So let's go here. Can you see my screen?  
Me: Yeah.  
Them: Okay. So this is the dataset that I pulled out for this company called AGR. And in every one of these little cells where there's, like, this little kind of star,  
Me: Uh-huh.  
Them: that means that there's AI. Working in that column. So, basically, these are all jobs that we closed last year, and I I cleaned it all up so we had the the actual data. We have the insurance company estimate in a PDF, and we have the roof report in a PDF. And then I'm having AI extract from the roof report all of the data that it that it generates that that is in the roof report. So that's actually very easy. Because it's, like, obviously labeled in the roof report and stuff like that. And then I have like, I had AI generate a list of the the approved items. So, like, if we sent in a supplement on this one, it looks at the first insurance estimate, and then it looks at the second insurance estimate, and it tells us what the differences are. So which is actually super helpful as well because if the client asks, like, what's approved, this is a quick way to to show that. I'm not using any of this stuff in the real world. I just built it in this dataset to to see as an experiment.  
Me: Okay.  
Them: I'm using some AI in Monday for for very small stuff, but so, basically, I need, like, a tool that will I would love to like I said, not be married till Monday. So if we needed to build, like, a a separate intake form, because we use monday.com to intake projects from our customers. Where they they send in through the form you know, the documentation that we require, which is the insurance company estimate, and the roof report and then photos that they have to submit or whatever, but we don't we're not gonna need AI to look at the photos. And then have AI, like, you would need to to get the data from the roof report out, and then you would need to get the data from the insurance company out of it And then you would need AI to determine what is missing in the insurance company estimate according to the roof report. And then we so I think what we could do is we could start building these I guess, calculations, like, one thing at a time. For example, and you can interrupt me with questions whenever you want, Jay, because I don't just talking a lot. But the all this information here just comes from the roof report. Well, with all this information, you could easily calculate how much ice and water barrier is required on a roof.  
Me: K.  
Them: And you could also calculate with this eave length that would be, like and the rake length. So eave length is equal to gutter apron. And rake is equal to drip edge. So these are all calculations that you could easily make with just this data that is here from the roof report. So I think if you you're the expert. But I feel like having some I don't know where this information is gonna function or what the best place is if it's not gonna be Monday. Mean, it can be Monday. But you know, I feel like the information needs to come into a form. It needs to be analyzed by the results need to go somewhere. And then we could start let's say we did we got one calculation working perfectly where we did, like, we got AI to read the like, we we worked on last year. Last year, our first one was drip edge. And I just run, like, enough tests But it actually works. You know? Pretty pretty close to flawlessly.  
Me: And  
Them: But now I feel  
Me: and the the the models have probably gotten three times better.  
Them: yeah. Exactly.  
Me: That type of shit.  
Them: So this stuff on this data, like, it this the it's never wrong. On these measurements. Like, because it's so obvious. The only time we actually have issues is when someone doesn't act like, scan the PDF the right way, and then the PDF is scanned in a way where it doesn't recognize the text. And then they AI can't recognize the text. That's the only time that we have an issue. So don't know what what your thoughts are, or or what kind of questions you wanna ask me.  
Me: Yeah. So me just think of so since most of what you're using Monday for is basically just a database like, a table slash database with smart columns. Right?  
Them: Yeah. Pretty much.  
Me: How much are you paying for Monday, by the way, per month? Or per year?  
Them: Mhmm. I wanna say it's like $2,000 a year.  
Me: Okay. In my In my mind, switching this to Airtable is what comes to mind first. Because Airtable is basically it's just a database that allows it gives you a front end UI like Monday does.  
Them: Mhmm.  
Me: But Airtable doesn't have the biases that Monday does. Like, Monday has some biases where have to do it like this way, and if you have this, we separate those two things as different. And if you wanna do this, that's, you know, like, it's Monday forces a few opinions on the the orchestration. Whereas, like, Airtable is totally raw. You can do whatever you want. There's no opinions or biases. And I think that it would be just as easy to do everything you're doing here And it's all via APIs. Like so what I think  
Them: Yeah.  
Me: is AirTape or nothing you're doing actually requires  
Them: Monday, specifically.  
Me: Yeah. What Monday is offering is a user interface.  
Them: Yeah.  
Me: And  
Them: Okay.  
Me: same as Airtable. I think Airtable is a lot cheaper. For what you're doing because I don't think there's actually that much complicated things that you're doing.  
Them: One. Just to interrupt you, the reason why I don't use why I didn't switch to Airtable is because it's it would be more expensive.  
Me: Oh, really?  
Them: And the re yeah. The reason why is because our we get to put all of our clients into Monday, as guests or viewers. And Airtable when I looked at the pricing, it wasn't I I don't think I was able to do that. So, basically, what I essentially, I can have, like, unlimited amount of customers coming into their workspaces and looking at boards and and so as far as doing what we're talking about, Airtable will work fine because it'll just be me as the user.  
Me: Yeah.  
Them: Pretty much. And then, I don't know, maybe we'll be able to monetize it and and and, you know, just charge a monthly fee for other roofers to use it. That would be, like, that would be fucking awesome. But but, yeah, we have to have that that teacher because we can't have all these roofers calling us day and be like, hey. What's going on with this job? They just need to be able to hop in there and look.  
Me: Yeah. Well,  
Them: And that's why we had  
Me: I mean, from that perspective, one of the things that has really changed  
Them: to do  
Me: is the simplicity at which it ease of which we can now make are your own web pages displaying content. So  
Them: Yeah.  
Me: now it'd be really if let's just I mean, I'm sure you could do it with Monday's API. But let's just say it's an Airtable. You create a web page you know, like, a client portal, basically. People log in, They go to a gr.  
Them: Yeah.  
Me: Estimate on e0d.com, and then put in the password and then you get access to their  
Them: Yeah.  
Me: section. And and  
Them: Yeah. She's No. I'd be happy to do that too. If you if because I really don't wanna keep using Monday.  
Me: yeah. Okay.  
Them: And they did hit me, like, two months ago. They were like, hey. You have a lot of guests on here. It's like guest abuse. And I'm like, well, you don't have a limit. And they're all my clients. So tell me what the limit is or go away.  
Me: Yeah.  
Them: And then you and then you and they never wrote me back. But I just feel like they're looking for a reason to to start billing me for all these other people. So I would be I would be stoked to have that as a solution If if you can make that happen, that'd be great.  
Me: Okay. So tell me a little bit So tell me a little bit about, like, what's your appetite for solving this? How much time can you actually dedicate to working on it? Because realistic  
Them: Can  
Me: Oh, yeah.  
Them: it, like so I really wanna solve this. So we're we're just reaching, like, a gonna reach, like, a threshold of of the the amount of business that we can handle right now. So we have to either change or have to bring on other people. Bringing on other people just means now I'm managing more people. And the people that I currently manage are people that I like working with. And it's because it's just Tom and Amy and Steve and everybody, you know, Courtney and Paulie and people like that. So it's great. I don't wanna but I don't wanna manage fucking people, man. I I I wanna get more business and make more money for everybody that works at EOD without having to bring on more people. So my appetite for solving this is is substantial. And the markets are the markets are gonna change. So if we could if we could get this to to where it was working and it actually became a tool, where I could charge a roofer, you know, $500 a month and it would it would analyze the documents the way that we're talking about having them analyzed and give it a response of, like, what's missing. Then that'd be that'd be amazing.  
Me: Okay.  
Them: And I have these I I actually have this dataset, and I can clone other boards. With with that it have even more data. So we have, like, a and and you can have access to all that data. And so and you know, we could even change the form the intake form for some of our customers currently and then just be like, hey. These are the intake forms. And then so the stuff we need to work on would still go to Monday, but it could also go to whatever you're working to get you know, new data from the tests. Because we get you know, right now, it's slow, but we're still getting 15 or 20 jobs a day. Yeah.  
Me: Wow. That's awesome. Okay. Well, I feel like, The way I can imagine okay. Let me back up. From the thing that we're looking at right now, this board  
Them: Hello?  
Me: is this basically like, a rep if if this board was working outside of Monday, and you had the right, intake form and you could press certain buttons and certain things would happen. There anything that this board is missing? As a proof of concept?  
Them: Well, it it's missing, like, the calculations of so this is just this is just the data. Didn't know you could draw on this. That's cool. So, you know, this is just data stuff. But there's no calculations in here. But I did have the calculations running as an experiment on one of the other boards, and it and it was pretty close to, like, getting it right. But I also don't know how good Monday Monday's AI is or what they're using.  
Me: Yeah. It's a black box.  
Them: Yeah. And you're limited on your prompt characters. So, like, that makes it that makes it a little bit more difficult.  
Me: Okay. So something that would be useful for me is creating a flowchart of what needs to happen at each step through an entire project. Like, from the time Andrew Ledger you know, the top field gets added. What are the what are all the steps that happen? Like, there's an intake form that's filled out, and then what happens? And then what happens? And then what happens?  
Them: Okay.  
Me: And just kind of, like, defining every step and where a human is doing something now that you want AI to do, where AI is doing something now that you want it to stay doing, You know, like, a human does something that you want a human to do it, like double checking something. You know, like, kind of understanding the flow from beginning to end and understanding, like, what needs to happen in that dataset. As that project evolves from one step to another and you know, like, because right now, the way Monday worked, if I remember,  
Them: So  
Me: you kind of have a a a row in here that is kind of duplicated elsewhere. And because you need to be able to if I remember right, you kind of had to duplicate a row so that you could add certain things and bring things with it But you because you couldn't really reference  
Them: Yeah. A lot of those issues that we had at the beginning, we've solved those without  
Me: Certain  
Them: without having to make it without having to duplicate all that stuff like you were previously.  
Me: Okay.  
Them: We we we've we've managed to to get that squared away. It works pretty pretty very smoothly right now.  
Me: Okay.  
Them: But I'm happy to do it in Airtable. You know?  
Me: Yeah. How many how many table or other than, like, a different board for different clients, how many different boards are there for yeah.  
Them: How many different boards are there for each client?  
Me: Yeah.  
Them: Typically, now I have it down to just two. Actually, the client only has access to one.  
Me: Okay.  
Them: We what we do is we put them we've we've consolidated them all into into one board. So all these groups are in one board. And then we have another board for paying contractors. So I but that's just internal.  
Me: So  
Them: So I I go through her every week to see who who gets paid what. On every client that we have.  
Me: Okay. And are those two boards connected?  
Them: No. Technically, they're not connected. We haven't we have an automation in this board that when we close a project, it creates this item in the contractor payments board. And sets sets the status to pending And then but they're technically not not connected. And as far as, like,  
Me: Okay.  
Them: define connected to find in Monday, they're not connected.  
Me: Okay.  
Them: So I can easily make a flowchart. That wouldn't take me very long.  
Me: Okay. Also, I mean, there's a handful of AI tools that can like, Claude, I think, can probably make a pretty good flowchart at this point.  
Them: Mhmm.  
Me: If you'd give it the right instructions. Or Gemini. And just be like, if you ask have you heard of mermaid charts?  
Them: No.  
Me: Mermaid chart is is a visual it's a way to visualize flowcharts, basically, but using markdown. Which is just a simple formatting.  
Them: Yeah.  
Me: It's kind of a nightmare to do by hand, but AI is awesome at making mermaid charts.  
Them: Okay.  
Me: And what's cool about that is you can just go in to, like, you know, Claude or Gemini and say, like, hey. I want you to make me a mermaid chart as an artifact on your canvas. And then tell it what needs to happen.  
Them: Okay.  
Me: And then you can edit it.  
Them: I can do that. I have Claude. I pay for the the $20.  
Me: Yeah. Then I would say that would probably be the easiest way to do that. And then I just, like, record me talking about the whole flow. And then say turn this into a flow chart using Mermaid and then just and then wait till it makes it and then ask for specific changes if you wanted.  
Them: Okay. Yeah. I could do that really easy. I have it all in my head. Pretty much of, like, how to get to the like, the intake and then the data analysis all done by AI. And then they will have to perform certain calculations like ice and water or drip edge. Gutter apron, But then there would have to be another user section where the human because AI is not looking at the photos. So human would have to say, there might be have to be, like, a questionnaire Like, and it'd be cool if the questionnaire was, like, logic based, so you weren't, like, just checking no on these ones, like, all the time. You know? Does that make so does this house have gutters? You know? Yes. Is this house two stories?  
Me: Yeah. Mhmm.  
Them: Or how many stories is this house? Or you know, things like that.  
Me: Well, so one of the nice things is if we're gonna take this outside of Monday, we could build any workflow we want. Which includes taking an image and sending it to Gemini and saying, does this house have two stories? Are there gutters on this house?  
Them: Yeah.  
Me: And having some of those like, because  
Them: So  
Me: if you used an open or an a multimodal  
Them: So  
Me: model, such as GPT-four o or Gemini, that can look at an image I guess, fuck, even Claude. If they can look at an image, you can ask questions about it, and then you can create a first round check.  
Them: Yep.  
Me: And then you could even send it to a different model with the answer and be like, is this correct? You know, this is this a two  
Them: Yeah.  
Me: story house? Yes. No. And if both pass, then it moves on. You know?  
Them: No. That'd be great then.  
Me: Yeah. That's shit that would be impossible on Monday, but, like,  
Them: Mean,  
Me: that's just a that's a trivial extra step to have AI right.  
Them: yeah, Yeah. Yeah.  
Me: So  
Them: I'm all for that.  
Me: let me show you let me just show you kind of a a little thing that I built recently. And more to just explain like, how simple some of this shit is. Like, I'm not a developer. I can't program. I can write HTML, and I can understand PHP, but I can't write it. So I made this for our community. It checks our Google Calendar and pulls all of the activities from our, the public Google Calendar. There's a campus email group and so this checks the campus email group and posts the last five community messages. There's a little baby girl being born, so it counts down. That's easy. This checks the weather.  
Them: Priorities  
Me: API. And this pulls data from a sheet and a Google Sheet based on who's cooking tonight and if there's lunch or dinner.  
Them: open. Is  
Me: The community.  
Them: Okay.  
Me: And  
Them: I'm gonna go outside.  
Me: the reason I show that is, like, again, I don't know how to program but I'm able to like, I'm building  
Them: It works.  
Me: tools now that do shit.  
Them: Yeah. Yeah. And then I was like,  
Me: So it's no it's it's yesterday, I was asking for the fact is, like, some of the things you're talking about is like, okay. I wanna add a step.  
Them: See? It's like, I'm  
Me: And I wanna do these processes on this step. As long as you can articulate it clearly and understand how you want it to be built, And then judge the answer and until it's correct. Those types of things aren't blockers anymore. And so that's an again, when you're making this flowchart, be thinking about what steps are currently done by a human that really need to be done by a human and which steps can be augmented by AI, which steps can be wholesale done by AI. And then maybe what happens is at the end,  
Them: So  
Me: you we build a little thing that just shows, like, here's a dashboard of every project and has a picture and an image and the PDFs and then all the things that has been pulled out, and you can just Yep. Approve. And the whole thing takes, like, fifteen seconds.  
Them: Yeah. I think we would especially at the beginning, we would have to be able to to review it and and approve it.  
Me: Yeah. And then, you know, after a hundred, correct.  
Them: Yeah.  
Me: It just works.  
Them: Yeah. I mean, you could probably you could probably sell this to, like, a roofer for, like, a thousand dollars a month. I mean, roofers pay us our pay us 10 times that.  
Me: So  
Them: So it's and there's a lot of roofers. So I think yeah, it'd be great if it was if we could build in a way that that we can go out and sell it.  
Me: Alright.  
Them: And I'm happy to this with you, Jay. Like, not I'll pay I'm happy to pay you for your for your time and your expertise. I'm also happy to to to be partners with you in this project because if you want to. Because it's just, like, more it's just better it's better for me because I don't have that I don't have that expertise then also you don't know anything about roofs. And so I I mean, I if you have the time to do it like, I don't have the time to do what you do. Especially now that, like, the season's starting. But so if you have the time, to do it, and I and I have the time to help you and answer all the questions.  
Me: Okay.  
Them: But I don't have, like, the the other one. Like, I don't have the time to to do with the testing and and all that stuff. But now, like I said, like, I feel like we've cleaned out I've cleaned out so much data that it'll you can get pretty far ahead.  
Me: And so just so that I understand  
Them: Like, right away.  
Me: when you're saying you've cleaned the data, so that we can use that as tests, basically, like, hey. Let's pretend this is a new one and go through all these steps and does it match  
Them: Yeah.  
Me: what you already did manually previous.  
Them: Yeah. Basically, what happened was, like, we would we would hyperlink to a lot of documents and then I realized, well, AI can't access that. So I downloaded every single, like, hundreds of these documents. And made sure that they're all in in the board and that and that they were OCR, I think, what they call it on in Adobe. So that it could read the text. Character whatever character you mentioned.  
Me: Yeah.  
Them: So the text is all readable and then I eliminated the ones that working properly. So it's got at least a 40 sets of data. That you could use for testing. But then also we have example, this client of ours that went out of business you know, that we have hundreds of their jobs. For additional testing.  
Me: Okay.  
Them: But then also, we have so for example, one client that I work with much exclusively, Tom helps me a little bit, Every time they send me a job, I go to their project management system, and I pull the data that I need. I can pull the data and put it through our our form so that we're constantly getting new fresh data and testing.  
Me: Yeah. Okay.  
Them: So I can test as we go.  
Me: Okay. Then  
Them: If that's it's not, like, an additional step, or if it's a if it's a minimal additional step, then it's I can I can I'm stoked to do that?  
Me: Okay. So I mean, realistically, I feel like this is I mean, this is probably at least twenty hours.  
Them: Yeah.  
Me: I mean, just kinda thinking about Typically so let me just say what the current thing is that I would tell anybody, and then I'm happy to actually talk to you, like, how would we wanna if it do we need to what adjustments would be made? But, like, right now, I'm bring all projects that are coming to me, I bring to Copy Sub, CopyClub. So Justin and I share. And same with him. He's getting some projects that are about the same, and we just funnel everything in. So that we take advantage of each other's strengths and help each other with everything. But that means that I probably have less flexibility on my pricing.  
Them: Yeah.  
Me: But I get  
Them: That's  
Me: more help.  
Them: yeah.  
Me: The way we are right now is if you sign up or we ask or or minimum engagement is three k. And we sell that in credits. And then those credits just work to hours. It allows clients to be like, hey. I want you to spend this much time on that and this much time on this. And then we just break the credits up. And then next month, it's whatever they want. And they can buy more credits or less credits each month. Does that make  
Them: Yeah. Yeah.  
Me: It's just kinda prepaying for hours.  
Them: Yeah.  
Me: If that's cool with you, I would love to do it that way, and then I'll just schedule, like, a couple of sessions to work on it probably late this week or early next week. As a kind of, like, first step. And then we can sit down and talk and then, like, kind of schedule, like, realistically, there's probably gonna be a sit and chat and talk, and then I go work for two to four hours. Then we get back together and, like, okay. This is what I thought is supposed to happen. Is this working right? How do you want it to change? What's the next step? Great. Now I'm gonna go build that. And just kind of interact until we start getting to a point where it's exactly what you want.  
Them: Yeah.  
Me: But I don't think I mean, I think that my ability to move fast like, since you have it working in Monday, I can do I can  
Them: Yeah.  
Me: copy a lot of what you already have and not have to redo or any of the thinking. But then, oh, that is a average prompt. Let's make it a killer prompt. You know, and let's not use the cheap LLM. Let's use the expensive one because it's the difference between half a penny and a penny. Where to Monday, that matters. To us, it doesn't.  
Them: Yeah. Yeah. Yeah. So let me just make some notes. Real quick. So I'm gonna make a flowchart  
Me: Yeah.  
Them: Flow chart in Claude. And I'm gonna have Claude I'm gonna have Claude draw it on the on the canvas as  
Me: And mermaid.  
Them: we draw a mermaid. Chart on this. This shouldn't take me very long at all because I know I'm getting it all in my head. So alright. Alright. I'll do that. And then just send me an email of where where I need to send the money for CopyClub. And then yeah, let me I'll send it over. And then can give you access to Monday.  
Me: Okay. And let's just  
Them: I'm gonna  
Me: start with, like, one client.  
Them: yeah, I'm just gonna give you access to this dataset.  
Me: Okay.  
Them: Is it do you just want me to do the g JSON?  
Me: Sure.  
Them: Gjason@gmail.com?  
Me: That sounds great.  
Them: I think I removed you You were on here before. I think I had took you off there because when when they hit something went wrong. So  
Me: So  
Them: when they hit me up about having too many users, I started going through my users and erasing, like, people that weren't using any  
Me: Yeah. Makes sense.  
Them: g j c. I don't know. It's not working, but I'll figure out why.  
Me: Okay.  
Them: And I'll and I'll or what's it or maybe what's a different email address?  
Me: Jason at CopyClub dot a I.  
Them: It's not CopyClub dot a I. That works. It must just be because you're still in there. Like, as a  
Me: Archived guest.  
Them: yeah, an archive user. So alright. I sent it to Jason@Copyclub.i. Alright. And I'll work on that I'll have that mermaid chart done, like, what's the today's Monday?  
Me: Two  
Them: Or today's Tuesday? Yeah. I'll have done by tomorrow. Sure. I'll probably just do it tonight.  
Me: Cool.  
Them: And then what what so what are you what are you gonna do with with the office, dude?  
Me: So we're planning on coming back in May or early June depending on maybe both. And probably have a sit down with everyone in the office and be like, what do people want? People wanna keep using it, people don't. But I would probably like to be  
Them: Yeah.  
Me: out of accountability for it.  
Them: Sure. Yeah.  
Me: And  
Them: I'm not I'm gonna keep it.  
Me: what's that?  
Them: We're I'm not sure if I'm gonna keep my office. We're trying to get that figured out.  
Me: Yeah.  
Them: But  
Me: What I don't want is everyone to leave in June and be like, yeah. I don't wanna pay anymore, and I'm here, and being like, the fuck am I supposed to do now?  
Them: Yeah. Of course.  
Me: So but  
Them: Yep.  
Me: we're not I mean, we're not done with CYALIDA. But I don't know when we'll be back for more than a month. Or two. You know?  
Them: Yeah.  
Me: It's just up here.  
Them: When you come back, are you staying for, like, a month or two?  
Me: Probably not. Probably just a couple weeks. It kinda depends on school, and, what where we like, where we can stay, you know, what's available.  
Them: Yeah.  
Me: I'm sure there's gonna be a lot of places available You know? And Brian and Beck or Barbara have even said we can use their place anytime.  
Them: Yeah.  
Me: So  
Them: Yeah. They're they're  
Me: yeah.  
Them: never there. Their place is awesome.  
Me: Yeah. And so we'll probably stay there as long as they're not there, and then stay as long as we can. I wanna come for as long as I can. Roman  
Them: That lever?  
Me: it's funny. Like, he never wants to miss school. He, like, loves being in school, loves getting good grades, loves seeing his friends, loves being on top of shit. So he's like, I don't wanna go for a week. I'm like, oh, buddy. I wanna go. But I don't know. That's why we're we're not quite sure what's gonna happen yet. It does make a lot of sense to wait till the good weather in Oregon and go to Mexico.  
Them: Yeah.  
Me: But not life doesn't always make all the sense.  
Them: Yeah. Cool. Well, I sent you that money today, by the way. To your InnerGame account. That's that I hold on the office. You gotta I looked on there. You just have to I don't know if those well, like, Sarah didn't even know. So  
Me: She's paid me. She's cut up.  
Them: how much Yeah. I saw that. But there's yeah. You might have to, like, remind people  
Me: Yeah. I  
Them: because Andre he, like, 20,000.  
Me: he had yeah. Andre little things little things.  
Them: Yeah. Yeah. I don't know if I'm gonna keep the office just because, like, I'm I'm I mean, I haven't worked there in, like, a year. So  
Me: Yeah. I wasn't sure if you were using it this fall or winter or not.  
Them: No. I'm just, like, gotten so comfortable, like, working at home. I don't like working at home, but then it's, like, yeah, it's just like it's it's gotten a lot easier. Than, like, going down there. And I and I still don't have water in my bathroom, so it's just like I don't wanna be there all day and, like, if I wanna take a shit, I gotta, like, use the common bathroom, which is not that big of a deal, but it's also just, like, not I don't know,  
Me: Yeah.  
Them: Like, I have my own bathroom. So  
Me: So  
Them: yeah. And then we got sorted. So and I'm out. I'm just kinda over asking Jordy to get it sorted. But yeah, I just wanted to see what you wanna do because I don't want you yeah. I don't want you to stuck, like, holding the bag. You're not even there to, like, enjoy it. So  
Me: Yeah.  
Them: you shouldn't  
Me: Once we I mean, I think it kinda makes sense. Like, once we when we know when we're coming, definitely planning on taking everything out of the office. So at least like, kind of liquidating the random like, shit that we have that I don't know what to do with.  
Them: Yeah.  
Me: You know? Because even if we come back, there's a handful of things. It's like, I don't know if I need that in my life. You know? Like,  
Them: Yep.  
Me: wherever we come back, we'll be  
Them: Right.  
Me: totally different than where we've been living. So getting rid of some shit and lightening our cellulita load will be helpful, and then just have an open conversation with everyone. And maybe maybe I start that when I know what date I'm coming back. And start asking people like, hey. Like, what do we wanna do with this? Who's interested in making it happen? Who wants to someone wanna keep it, who wants to take over? Kind of start projecting, like, maybe June be my last  
Them: Yeah.  
Me: month?  
Them: I haven't talked to anybody about it. At all, really, but, like, I I'm assume the people that are there right now wanna  
Me: Yeah.  
Them: stay. Yeah.  
Me: Dave seems happy.  
Them: Andre loves it, and  
Me: Yeah.  
Them: I'm assuming that Reyes and Sarah like it Otherwise, they they wouldn't still be there.  
Me: Yeah. And  
Them: No.  
Me: have no idea how often Brian's there, but he pays.  
Them: Every time I go in there right here, I can tell he's there.  
Me: Okay.  
Them: Because he can hear, you know, he can hear people on the phone. From my office. So  
Me: Yeah. Alright.  
Them: you can tell he's there.  
Me: Well, I'll I'm probably gonna wait. And then May when I send out the, hey. It's time to pay rent. I'll kind of that's a two month notice to kind of start chatting with people put it in their head.  
Them: Yeah. Cool.  
Me: Hello?  
Them: Well,  
Me: By the way, how's the EOD doing? Are you guys is it is it a good year? You said you're up three x over last. Is that right?  
Them: Lat 2024 was three x over 2023.  
Me: Dude, that's awesome.  
Them: Yeah. And now we already have way more clients this year than we did last year. So you know, I'm I feel like this year, we'll do over 2,000,000.  
Me: Holy shit.  
Them: So yeah. Yeah. Last year, last year, we had, like, you know, we had  
Me: So  
Them: several clients that paid us over a hundred and $40. So  
Me: That's all.  
Them: each  
Me: So  
Them: yeah, We did lose one client. Like, kind of a steady client but we're kinda happy to have lost him, to be honest. But  
Me: I mean, EOD's paying a lot of cellulose salaries. That's pretty rad.  
Them: It's rad. Yeah. It feels good. Yeah. I talked to Tom this morning. He's, like, in New Orleans. For a month. So I I love it. Like, it's fucking great. And Steve and Natasha just went back to Vancouver, but they they, like, they bought a condo in Salida. They made enough money to buy a condo.  
Me: That's fucking awesome.  
Them: Yeah. So they're they're stoked. But, yeah, it's not sustainable, man. So we just have to I don't wanna AI those people out of the job. But I wanna AI them into making five times more money with 10 times more clients or something like that. You know?  
Me: Yeah.  
Them: Just by giving them the tools. I don't wanna manage my customers. Like, they're those those guys, especially Steve, they're all better at, like, managing their clients. Because I just you know me, I just don't like people. So, like, yeah, giving them the tools to to be able to do more would be great. Because like I said, you can only write actually writing an estimate, like, it takes time. You can only do so many a day.  
Me: Mhmm.  
Them: So be great to to create tool that will allow us to not have to do that.  
Me: Yeah. Awesome. Well,  
Them: So  
Me: I'll send over a link to the sign up form. Let's, let's figure out like, you give me next steps, and I'll start scheduling time to work on  
Them: Okay. Cool. I'll do that.  
Me: it.  
Them: That chart today, and and we'll be in touch. Stay out of Holly, man, and the boys.  
Me: Yeah. Say hi to your girls, all of them.  
Them: Alright, buddy. Later, dude.  
Me: Alright. Bye. 